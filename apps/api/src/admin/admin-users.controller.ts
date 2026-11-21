import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/decorators';
import type { VerifiedUser } from '../auth/jwt-verifier';
import { toHttpError } from '../common/pg-errors';
import { company, userCompanyAccess } from '../db/schema/schema';
import { UserDb, type UserTx } from '../db/user-db';
import {
  AdminUserDto,
  COMPANY_ROLES,
  CreateAdminUserBodyDto,
  GROUP_ROLES,
  UpdateAdminUserAccessBodyDto,
  type AccessRoleCode,
  type UserAccessGrantDto,
} from './admin-users.dto';
import { SupabaseAdminService } from './supabase-admin.service';

const bodyPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false });

/** Valida que los roles de grupo tengan companyId null y los roles de empresa tengan un companyId. */
function normalizeRoleAndCompany(
  roleCode: AccessRoleCode,
  rawCompanyId: string | null | undefined,
): string | null {
  const companyId = typeof rawCompanyId === 'string' && rawCompanyId.trim() !== '' ? rawCompanyId.trim() : null;
  if (GROUP_ROLES.has(roleCode)) {
    if (companyId !== null) {
      throw new BadRequestException(`El rol de grupo ${roleCode} exige companyId null`);
    }
    return null;
  }
  if (COMPANY_ROLES.has(roleCode)) {
    if (companyId === null) {
      throw new BadRequestException(`El rol ${roleCode} exige indicar un companyId`);
    }
    return companyId;
  }
  throw new BadRequestException(`Rol inválido: ${roleCode}`);
}

/**
 * Panel de administración de usuarios (solo GROUP_CONTROLLER → permiso masterData).
 * Crea usuarios en Supabase Auth usando SUPABASE_SECRET_KEY desde el servidor y administra
 * sus accesos en "userCompanyAccess" dentro de una transacción RLS con el JWT del administrador.
 */
@ApiTags('admin')
@RequirePermission('masterData')
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly db: UserDb,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar usuarios y sus accesos en userCompanyAccess (solo GROUP_CONTROLLER)',
    description:
      'Devuelve la lista de usuarios con su correo (desde Supabase Auth / auth.users), su rol y empresa vigentes y sus filas de userCompanyAccess.',
  })
  @ApiOkResponse({ type: [AdminUserDto] })
  @ApiForbiddenResponse({ description: 'Requiere el permiso masterData (GROUP_CONTROLLER).' })
  async list(@CurrentUser() user: VerifiedUser): Promise<AdminUserDto[]> {
    const authUsers = await this.supabaseAdmin.listAuthUsers().catch(() => []);
    const emailMap = new Map<string, string>();
    for (const u of authUsers) {
      if (u.email) emailMap.set(u.id, u.email);
    }

    return this.db.run(user, async (tx) => {
      try {
        const dbEmails = await tx.execute<{ userId: string; email: string | null }>(
          sql`select "userId", "email" from authz."fnListAuthUserEmails"()`,
        );
        for (const row of dbEmails) {
          if (row.userId && row.email && !emailMap.has(row.userId)) {
            emailMap.set(row.userId, row.email);
          }
        }
      } catch {
        // Si la función auxiliar aún no está creada, se usan los correos del Admin API
      }

      const grants = await tx
        .select()
        .from(userCompanyAccess)
        .orderBy(asc(userCompanyAccess.accessId));

      const byUser = new Map<string, UserAccessGrantDto[]>();
      for (const g of grants) {
        const list = byUser.get(g.userId) ?? [];
        list.push(toGrantDto(g));
        byUser.set(g.userId, list);
      }

      const result: AdminUserDto[] = [];
      for (const [userId, userGrants] of byUser.entries()) {
        result.push(buildAdminUserDto(userId, emailMap.get(userId) ?? null, userGrants));
      }

      return result;
    });
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Dar de alta un usuario en Supabase Auth y asignarle rol y empresa (solo GROUP_CONTROLLER)',
    description:
      'Crea el usuario en Supabase Auth con SUPABASE_SECRET_KEY desde el servidor (contraseña temporal, email confirmado) ' +
      'e inserta su fila de acceso en userCompanyAccess dentro de una transacción con el JWT del administrador. ' +
      'Si el correo ya existe devuelve 409.',
  })
  @ApiCreatedResponse({ type: AdminUserDto })
  @ApiBadRequestResponse({ description: 'Correo, contraseña, rol o empresa inválidos.' })
  @ApiForbiddenResponse({ description: 'Requiere el permiso masterData (GROUP_CONTROLLER).' })
  @ApiConflictResponse({ description: 'El correo electrónico ya está registrado.' })
  async create(
    @CurrentUser() user: VerifiedUser,
    @Body(bodyPipe) body: CreateAdminUserBodyDto,
  ): Promise<AdminUserDto> {
    const companyId = normalizeRoleAndCompany(body.roleCode, body.companyId);
    const email = body.email.trim().toLowerCase();

    // Validar que la empresa exista antes de crear el usuario en Auth
    if (companyId !== null) {
      await this.db.run(user, async (tx) => {
        await this.ensureCompanyExists(tx, companyId);
      });
    }

    const createdAuth = await this.supabaseAdmin.createAuthUser(email, body.password);

    try {
      return await this.db.run(user, async (tx) => {
        try {
          await tx.execute(
            sql`select authz."fnEnsureAuthUser"(${createdAuth.id}::uuid, ${createdAuth.email})`,
          );
        } catch {
          // En Supabase real GoTrue ya insertó la fila en auth.users
        }

        await this.upsertGrant(tx, createdAuth.id, body.roleCode, companyId);

        const userGrants = await tx
          .select()
          .from(userCompanyAccess)
          .where(eq(userCompanyAccess.userId, createdAuth.id))
          .orderBy(asc(userCompanyAccess.accessId));

        return buildAdminUserDto(
          createdAuth.id,
          createdAuth.email,
          userGrants.map(toGrantDto),
        );
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  @Patch(':id/access')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cambiar o revocar el rol o la empresa de un usuario (solo GROUP_CONTROLLER)',
    description:
      'Actualiza o revoca (isActive=false) el acceso del usuario en userCompanyAccess. ' +
      'Los roles de grupo exigen companyId null; los roles de empresa exigen un companyId válido.',
  })
  @ApiOkResponse({ type: AdminUserDto })
  @ApiBadRequestResponse({ description: 'Combinación de rol, empresa o estado inválida.' })
  @ApiForbiddenResponse({ description: 'Requiere el permiso masterData (GROUP_CONTROLLER).' })
  @ApiNotFoundResponse({ description: 'Usuario o empresa no encontrados.' })
  async updateAccess(
    @CurrentUser() user: VerifiedUser,
    @Param('id', new ParseUUIDPipe()) targetUserId: string,
    @Body(bodyPipe) body: UpdateAdminUserAccessBodyDto,
  ): Promise<AdminUserDto> {
    if (body.roleCode === undefined && body.companyId === undefined && body.isActive === undefined) {
      throw new BadRequestException('Debe indicar al menos roleCode, companyId o isActive');
    }

    try {
      return await this.db.run(user, async (tx) => {
        const existingGrants = await tx
          .select()
          .from(userCompanyAccess)
          .where(eq(userCompanyAccess.userId, targetUserId))
          .orderBy(asc(userCompanyAccess.accessId));

        let email: string | null = null;
        try {
          const rows = await tx.execute<{ userId: string; email: string | null }>(
            sql`select "userId", "email" from authz."fnListAuthUserEmails"() where "userId" = ${targetUserId}::uuid`,
          );
          if (rows[0]?.email) email = rows[0].email;
        } catch {
          // ignore
        }

        if (existingGrants.length === 0 && email === null) {
          throw new NotFoundException('Usuario no encontrado');
        }

        // Caso revocación explícita (isActive === false sin nuevo rol activo)
        if (body.isActive === false && body.roleCode === undefined) {
          await tx
            .update(userCompanyAccess)
            .set({ isActive: false })
            .where(and(eq(userCompanyAccess.userId, targetUserId), eq(userCompanyAccess.isActive, true)));
        } else {
          const currentActive =
            existingGrants.filter((g) => g.isActive).at(-1) ?? existingGrants.at(-1);
          const nextRole = (body.roleCode ?? currentActive?.roleCode) as AccessRoleCode | undefined;
          if (!nextRole) {
            throw new BadRequestException('roleCode es obligatorio cuando el usuario no tiene un rol previo');
          }
          const rawCompany =
            body.companyId !== undefined ? body.companyId : currentActive?.companyId ?? null;
          const nextCompanyId = normalizeRoleAndCompany(nextRole, rawCompany);

          if (nextCompanyId !== null) {
            await this.ensureCompanyExists(tx, nextCompanyId);
          }

          // Desactivar otros grants activos y activar el grant objetivo
          await tx
            .update(userCompanyAccess)
            .set({ isActive: false })
            .where(and(eq(userCompanyAccess.userId, targetUserId), eq(userCompanyAccess.isActive, true)));

          if (body.isActive !== false) {
            await this.upsertGrant(tx, targetUserId, nextRole, nextCompanyId);
          }
        }

        const updatedGrants = await tx
          .select()
          .from(userCompanyAccess)
          .where(eq(userCompanyAccess.userId, targetUserId))
          .orderBy(asc(userCompanyAccess.accessId));

        return buildAdminUserDto(targetUserId, email, updatedGrants.map(toGrantDto));
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  private async ensureCompanyExists(tx: UserTx, companyId: string): Promise<void> {
    const [comp] = await tx
      .select({ companyId: company.companyId })
      .from(company)
      .where(eq(company.companyId, companyId));
    if (!comp) {
      throw new NotFoundException(`Empresa ${companyId} no encontrada`);
    }
  }

  private async upsertGrant(
    tx: UserTx,
    userId: string,
    roleCode: AccessRoleCode,
    companyId: string | null,
  ): Promise<void> {
    const companyMatch =
      companyId === null
        ? isNull(userCompanyAccess.companyId)
        : eq(userCompanyAccess.companyId, companyId);

    const [existing] = await tx
      .select()
      .from(userCompanyAccess)
      .where(
        and(
          eq(userCompanyAccess.userId, userId),
          eq(userCompanyAccess.roleCode, roleCode),
          companyMatch,
        ),
      );

    if (existing) {
      await tx
        .update(userCompanyAccess)
        .set({ isActive: true })
        .where(eq(userCompanyAccess.accessId, existing.accessId));
    } else {
      await tx.insert(userCompanyAccess).values({
        userId,
        roleCode,
        companyId,
        isActive: true,
      });
    }
  }
}

function toGrantDto(row: typeof userCompanyAccess.$inferSelect): UserAccessGrantDto {
  return {
    accessId: row.accessId,
    userId: row.userId,
    companyId: row.companyId,
    roleCode: row.roleCode as AccessRoleCode,
    isActive: row.isActive,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

function buildAdminUserDto(
  userId: string,
  email: string | null,
  grants: UserAccessGrantDto[],
): AdminUserDto {
  const active = grants.filter((g) => g.isActive).at(-1) ?? null;
  const fallback = active ?? grants.at(-1) ?? null;
  return {
    userId,
    email,
    roleCode: active ? active.roleCode : fallback?.roleCode ?? null,
    companyId: active ? active.companyId : fallback?.companyId ?? null,
    isActive: Boolean(active),
    grants,
  };
}
