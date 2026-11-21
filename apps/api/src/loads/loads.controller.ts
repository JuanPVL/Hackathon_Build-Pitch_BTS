import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { CurrentUser } from '../auth/current-user.decorator';
import type { VerifiedUser } from '../auth/jwt-verifier';
import { optionalCode } from '../common/params';
import { toHttpError } from '../common/pg-errors';
import { company, dataLoad, dataLoadLine, scenario, validationFinding } from '../db/schema/schema';
import { UserDb } from '../db/user-db';
import {
  MAX_CSV_BYTES,
  parseCsvBuffer,
  resolveFinancialStatementCode,
  validateUploadedCsvFile,
} from './csv-parser';
import {
  ApproveLoadBodyDto,
  ApproveLoadResponseDto,
  UploadLoadBodyDto,
  UploadLoadMultipartDto,
  UploadLoadResponseDto,
  ValidateLoadResponseDto,
} from './loads.dto';

const bodyPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false });

/** It-0 + P0-3 / P0-4 / P0-5: cargas visibles y ciclo upload → validate → approve con RLS. */
@ApiTags('loads')
@Controller('loads')
export class LoadsController {
  constructor(private readonly db: UserDb) {}

  @Get()
  @ApiOperation({
    summary: 'Listar cargas visibles para el usuario (RLS)',
    description: 'Filtra opcionalmente por scenarioId y/o companyId. El recorte por empresa lo aplica RLS.',
  })
  @ApiQuery({ name: 'scenarioId', required: false, type: String, description: 'Filtro opcional por escenario (p. ej. PPTO_V1, PPTO_V2).' })
  @ApiQuery({ name: 'companyId', required: false, type: String, description: 'Filtro opcional por empresa (p. ej. GT1, MX1).' })
  list(
    @CurrentUser() user: VerifiedUser,
    @Query('scenarioId') scenarioIdRaw?: string,
    @Query('companyId') companyIdRaw?: string,
  ) {
    const scenarioId = optionalCode(scenarioIdRaw, 'scenarioId');
    const companyId = optionalCode(companyIdRaw, 'companyId');
    const filters: SQL[] = [];
    if (scenarioId) filters.push(eq(dataLoad.scenarioId, scenarioId));
    if (companyId) filters.push(eq(dataLoad.companyId, companyId));
    return this.db.run(user, (tx) =>
      tx
        .select()
        .from(dataLoad)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(
          asc(dataLoad.scenarioId),
          asc(dataLoad.companyId),
          asc(dataLoad.financialStatementCode),
          asc(dataLoad.version),
        ),
    );
  }

  /** Detalle con sus líneas. Una carga que RLS no deja ver responde 404 (no se revela si existe). */
  @Get(':loadId')
  async get(@CurrentUser() user: VerifiedUser, @Param('loadId', new ParseUUIDPipe()) loadId: string) {
    const result = await this.db.run(user, async (tx) => {
      const [load] = await tx.select().from(dataLoad).where(eq(dataLoad.loadId, loadId));
      if (!load) return undefined;
      const lines = await tx
        .select()
        .from(dataLoadLine)
        .where(eq(dataLoadLine.loadId, loadId))
        .orderBy(asc(dataLoadLine.rowNumber));
      return { ...load, lines };
    });
    if (!result) throw new NotFoundException('Carga no encontrada');
    return result;
  }

  /** P0-3: sube un archivo CSV y crea una versión nueva en estado RECIBIDA; nunca sobrescribe una versión anterior. */
  @Post('upload')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_CSV_BYTES + 1024 },
    }),
  )
  @ApiOperation({
    summary: 'Subir archivo CSV de presupuesto o balance (P0-3)',
    description:
      'Recibe un archivo CSV en multipart/form-data junto con companyId y scenarioId (y opcionalmente financialStatementCode). ' +
      'Valida tamaño, extensión/MIME y encabezados, y crea una nueva versión de dataLoad en estado RECIBIDA con sus líneas en dataLoadLine. ' +
      'Nunca sobrescribe una versión anterior.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadLoadMultipartDto })
  @ApiCreatedResponse({ type: UploadLoadResponseDto })
  @ApiBadRequestResponse({ description: 'Archivo CSV, encabezados o parámetros inválidos.' })
  @ApiForbiddenResponse({ description: 'Sin permiso de escritura sobre la empresa indicada.' })
  @ApiNotFoundResponse({ description: 'Empresa o escenario inexistente.' })
  @ApiConflictResponse({ description: 'El escenario está cerrado.' })
  async upload(
    @CurrentUser() user: VerifiedUser,
    @UploadedFile()
    file: { originalname?: string; mimetype?: string; size?: number; buffer?: Buffer } | undefined,
    @Body(bodyPipe) body: UploadLoadBodyDto,
  ): Promise<UploadLoadResponseDto> {
    const { fileName, buffer } = validateUploadedCsvFile(file);
    const { fileHash, lines } = parseCsvBuffer(buffer);
    const financialStatementCode = resolveFinancialStatementCode(body.financialStatementCode, fileName);

    try {
      return await this.db.run(user, async (tx) => {
        const [{ canWrite }] = await tx.execute<{ canWrite: boolean }>(
          sql`select authz."canWriteCompany"(${body.companyId}) as "canWrite"`,
        );
        if (!canWrite) {
          throw new ForbiddenException(`Sin permiso de escritura sobre la empresa ${body.companyId}`);
        }

        const [comp] = await tx
          .select({ companyId: company.companyId })
          .from(company)
          .where(eq(company.companyId, body.companyId));
        if (!comp) throw new NotFoundException(`Empresa ${body.companyId} no encontrada`);

        const [scen] = await tx
          .select({ scenarioId: scenario.scenarioId, statusCode: scenario.statusCode })
          .from(scenario)
          .where(eq(scenario.scenarioId, body.scenarioId));
        if (!scen) throw new NotFoundException(`Escenario ${body.scenarioId} no encontrado`);
        if (scen.statusCode === 'CERRADO') {
          throw new ConflictException(`El escenario ${body.scenarioId} está cerrado`);
        }

        const [created] = await tx.execute<{
          loadId: string;
          companyId: string;
          scenarioId: string;
          financialStatementCode: string;
          fileName: string;
          fileHash: string | null;
          version: number;
          statusCode: string;
          uploadedBy: string | null;
          uploadedAt: string;
        }>(sql`
          insert into "dataLoad" (
            "companyId", "scenarioId", "financialStatementCode",
            "fileName", "fileHash", "statusCode"
          ) values (
            ${body.companyId}, ${body.scenarioId}, ${financialStatementCode},
            ${fileName}, ${fileHash}, 'RECIBIDA'
          )
          returning "loadId", "companyId", "scenarioId", "financialStatementCode",
                    "fileName", "fileHash", "version", "statusCode",
                    "uploadedBy", "uploadedAt"::text as "uploadedAt"
        `);

        // Si ya existe una versión previa con el mismo nombre de archivo, incluye vN en lineId para mantener PK única y nunca sobrescribir líneas anteriores
        const linePrefix = created.version === 1 ? fileName : `${fileName}@v${created.version}`;
        const rowsToInsert = lines.map((line) => ({
          lineId: `${linePrefix}#fila${line.rowNumber}`,
          loadId: created.loadId,
          rowNumber: line.rowNumber,
          companyCode: line.companyCode,
          scenarioCode: line.scenarioCode,
          periodCode: line.periodCode,
          localAccountCode: line.localAccountCode,
          description: line.description,
          currencyCode: line.currencyCode,
          amount: line.amount,
          icPartnerCode: line.icPartnerCode,
          icDocumentId: line.icDocumentId,
          transactionCurrencyCode: line.transactionCurrencyCode,
          transactionAmount: line.transactionAmount,
          counterpartyTaxId: line.counterpartyTaxId,
          volume: line.volume,
          price: line.price,
        }));

        await tx.insert(dataLoadLine).values(rowsToInsert);

        return {
          loadId: created.loadId,
          companyId: created.companyId,
          scenarioId: created.scenarioId,
          financialStatementCode: created.financialStatementCode,
          fileName: created.fileName,
          fileHash: created.fileHash,
          version: created.version,
          statusCode: created.statusCode,
          rowCount: rowsToInsert.length,
          uploadedBy: created.uploadedBy,
          uploadedAt: created.uploadedAt,
        };
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  /** P0-4: corre las reglas de validación sobre la carga (fnValidarCarga). 0 hallazgos → VALIDADA; con hallazgos → CUARENTENA. */
  @Post(':loadId/validate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Ejecutar validación sobre una carga (P0-4)',
    description:
      'Ejecuta la función SQL fnValidarCarga sobre la carga indicada. ' +
      'Si no hay hallazgos la carga pasa a VALIDADA; si hay errores o advertencias pasa a CUARENTENA y persiste los hallazgos en validationFinding.',
  })
  @ApiOkResponse({ type: ValidateLoadResponseDto })
  @ApiForbiddenResponse({ description: 'Sin permiso de escritura sobre la empresa de la carga.' })
  @ApiNotFoundResponse({ description: 'Carga no encontrada o no visible por RLS.' })
  @ApiConflictResponse({ description: 'La carga ya está APROBADA o REEMPLAZADA.' })
  async validate(
    @CurrentUser() user: VerifiedUser,
    @Param('loadId', new ParseUUIDPipe()) loadId: string,
  ): Promise<ValidateLoadResponseDto> {
    try {
      return await this.db.run(user, async (tx) => {
        const [load] = await tx.select().from(dataLoad).where(eq(dataLoad.loadId, loadId));
        if (!load) throw new NotFoundException('Carga no encontrada');

        const [{ canWrite }] = await tx.execute<{ canWrite: boolean }>(
          sql`select authz."canWriteCompany"(${load.companyId}) as "canWrite"`,
        );
        if (!canWrite) {
          throw new ForbiddenException(`Sin permiso de escritura sobre la empresa ${load.companyId}`);
        }

        if (load.statusCode === 'APROBADA' || load.statusCode === 'REEMPLAZADA') {
          throw new ConflictException(`La carga en estado ${load.statusCode} no se puede revalidar`);
        }

        const [{ res }] = await tx.execute<{
          res: { statusCode: string; blocking: number; warnings: number; info: number; total: number };
        }>(sql`select "fnValidarCarga"(${loadId}::uuid) as res`);

        const findings = await tx
          .select()
          .from(validationFinding)
          .where(eq(validationFinding.loadId, loadId))
          .orderBy(desc(validationFinding.impactUsd), asc(validationFinding.findingId));

        return {
          loadId: load.loadId,
          companyId: load.companyId,
          scenarioId: load.scenarioId,
          financialStatementCode: load.financialStatementCode,
          version: load.version,
          statusCode: res.statusCode,
          totals: {
            blocking: Number(res.blocking ?? 0),
            warnings: Number(res.warnings ?? 0),
            info: Number(res.info ?? 0),
          },
          findingsCount: findings.length,
          findings,
        };
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  /** P0-5: aprueba una carga que esté en estado VALIDADA. No se pueden saltar estados (409). */
  @Post(':loadId/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Aprobar una carga validada (P0-5)',
    description:
      'Solo una carga en estado VALIDADA puede pasar a APROBADA. ' +
      'Si la carga está en RECIBIDA, CUARENTENA, APROBADA o REEMPLAZADA devuelve 409 (no se pueden saltar estados). ' +
      'El trigger de base de datos registra approvedBy = audit.currentUserId(), approvedAt y reemplaza cualquier versión APROBADA anterior de la misma empresa/escenario/estado financiero.',
  })
  @ApiBody({ type: ApproveLoadBodyDto, required: false })
  @ApiOkResponse({ type: ApproveLoadResponseDto })
  @ApiForbiddenResponse({ description: 'Sin permiso sobre la empresa de la carga.' })
  @ApiNotFoundResponse({ description: 'Carga no encontrada o no visible por RLS.' })
  @ApiConflictResponse({ description: 'Transición de estado inválida (la carga no está en estado VALIDADA).' })
  async approve(
    @CurrentUser() user: VerifiedUser,
    @Param('loadId', new ParseUUIDPipe()) loadId: string,
    @Body(bodyPipe) body?: ApproveLoadBodyDto,
  ): Promise<ApproveLoadResponseDto> {
    try {
      return await this.db.run(user, async (tx) => {
        const [load] = await tx.select().from(dataLoad).where(eq(dataLoad.loadId, loadId));
        if (!load) throw new NotFoundException('Carga no encontrada');

        const [{ canWrite }] = await tx.execute<{ canWrite: boolean }>(
          sql`select authz."canWriteCompany"(${load.companyId}) as "canWrite"`,
        );
        if (!canWrite) {
          throw new ForbiddenException(`Sin permiso sobre la empresa ${load.companyId}`);
        }

        if (load.statusCode !== 'VALIDADA') {
          throw new ConflictException(
            `Transición inválida: solo una carga en estado VALIDADA puede pasar a APROBADA (estado actual: ${load.statusCode})`,
          );
        }

        const reasonRaw = body?.justification ?? body?.reason;
        const statusReason = typeof reasonRaw === 'string' && reasonRaw.trim() !== '' ? reasonRaw.trim() : load.statusReason;

        const [updated] = await tx.execute<{
          loadId: string;
          companyId: string;
          scenarioId: string;
          financialStatementCode: string;
          version: number;
          statusCode: string;
          statusReason: string | null;
          approvedBy: string | null;
          approvedAt: string | null;
        }>(sql`
          update "dataLoad"
             set "statusCode" = 'APROBADA',
                 "statusReason" = ${statusReason ?? null}
           where "loadId" = ${loadId}::uuid
          returning "loadId", "companyId", "scenarioId", "financialStatementCode",
                    "version", "statusCode", "statusReason",
                    "approvedBy", "approvedAt"::text as "approvedAt"
        `);

        return {
          loadId: updated.loadId,
          companyId: updated.companyId,
          scenarioId: updated.scenarioId,
          financialStatementCode: updated.financialStatementCode,
          version: updated.version,
          statusCode: updated.statusCode,
          statusReason: updated.statusReason,
          approvedBy: updated.approvedBy,
          approvedAt: updated.approvedAt,
        };
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }
}
