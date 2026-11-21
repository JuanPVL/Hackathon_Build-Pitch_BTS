import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { CurrentUser } from '../auth/current-user.decorator';
import type { VerifiedUser } from '../auth/jwt-verifier';
import { CodeParamPipe } from '../common/params';
import { toHttpError } from '../common/pg-errors';
import { icDocument } from '../db/schema/schema';
import { UserDb, type UserTx } from '../db/user-db';

interface AcceptBody {
  version?: unknown;
}
interface DisputeBody extends AcceptBody {
  reason?: unknown;
}

/**
 * Bandeja IC del receptor. Invoca "fnAcceptIcDocument" / "fnDisputeIcDocument" (SQL, security
 * invoker) con el JWT del usuario: Nest no reimplementa el flujo ni la máquina de estados.
 */
@Controller('ic-documents')
export class IcDocumentsController {
  constructor(private readonly db: UserDb) {}

  @Post(':icDocumentId/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: VerifiedUser, @Param('icDocumentId', CodeParamPipe) id: string, @Body() body: AcceptBody) {
    const version = parseVersion(body?.version);
    return this.act(user, id, version, (tx) => tx.execute(sql`select "fnAcceptIcDocument"(${id}, ${version})`));
  }

  @Post(':icDocumentId/dispute')
  @HttpCode(200)
  dispute(@CurrentUser() user: VerifiedUser, @Param('icDocumentId', CodeParamPipe) id: string, @Body() body: DisputeBody) {
    const version = parseVersion(body?.version);
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason || reason.length > 500) throw new BadRequestException('reason es obligatorio (máx. 500 caracteres)');
    return this.act(user, id, version, (tx) => tx.execute(sql`select "fnDisputeIcDocument"(${id}, ${version}, ${reason})`));
  }

  private async act(user: VerifiedUser, id: string, version: number, call: (tx: UserTx) => Promise<unknown>) {
    try {
      return await this.db.run(user, async (tx) => {
        const where = and(eq(icDocument.icDocumentId, id), eq(icDocument.version, version));
        const [doc] = await tx.select({ receiverCompanyId: icDocument.receiverCompanyId }).from(icDocument).where(where);
        if (!doc) throw new NotFoundException('Documento IC no encontrado');
        const [{ canWrite }] = await tx.execute<{ canWrite: boolean }>(
          sql`select authz."canWriteCompany"(${doc.receiverCompanyId}) as "canWrite"`,
        );
        if (!canWrite) throw new ForbiddenException('Solo la empresa receptora puede aceptar o disputar');
        await call(tx);
        const [updated] = await tx
          .select({
            icDocumentId: icDocument.icDocumentId,
            version: icDocument.version,
            statusCode: icDocument.statusCode,
            statusReason: icDocument.statusReason,
          })
          .from(icDocument)
          .where(where);
        return updated;
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }
}

function parseVersion(value: unknown): number {
  const version = typeof value === 'string' ? Number(value) : value;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BadRequestException('version debe ser un entero >= 1');
  }
  return version;
}
