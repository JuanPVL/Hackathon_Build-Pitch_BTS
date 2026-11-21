import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, desc, eq, sql } from 'drizzle-orm';
import { CurrentUser } from '../auth/current-user.decorator';
import type { VerifiedUser } from '../auth/jwt-verifier';
import { CodeParamPipe } from '../common/params';
import { toHttpError } from '../common/pg-errors';
import { dataLoad, dataLoadLine, icDocument, icPayable, icReceivable } from '../db/schema/schema';
import { UserDb, type UserTx } from '../db/user-db';
import {
  GetIcDocumentQueryDto,
  IcDocumentResponseDto,
  type IcPayableDto,
  type IcReceivableDto,
  type IcSourceRefDto,
} from './ic-documents.dto';

interface AcceptBody {
  version?: unknown;
}
interface DisputeBody extends AcceptBody {
  reason?: unknown;
}

const queryPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false });

/**
 * Bandeja IC del receptor. Invoca "fnAcceptIcDocument" / "fnDisputeIcDocument" (SQL, security
 * invoker) con el JWT del usuario: Nest no reimplementa el flujo ni la máquina de estados.
 */
@ApiTags('ic-documents')
@Controller('ic-documents')
export class IcDocumentsController {
  constructor(private readonly db: UserDb) {}

  @Get(':icDocumentId')
  @ApiOperation({
    summary: 'Documento IC vigente (o una versión pedida) con permisos de acción',
    description:
      'Sin version, resuelve la vigente: la mayor versión que no está ANULADA (con scenarioId si se envía). ' +
      'Con version, devuelve esa versión sin sustituirla por la más reciente. ' +
      'permissions refleja empresa receptora, rol, estado y si la versión es la vigente. ' +
      'receivable/payable solo incluyen columnas reales; son null si no existen o RLS no las deja ver.',
  })
  @ApiOkResponse({ type: IcDocumentResponseDto })
  @ApiBadRequestResponse({ description: 'Identificador, version o scenarioId inválidos.' })
  @ApiNotFoundResponse({ description: 'El documento no existe, no es visible para el usuario o no coincide el escenario.' })
  get(
    @CurrentUser() user: VerifiedUser,
    @Param('icDocumentId', CodeParamPipe) id: string,
    @Query(queryPipe) query: GetIcDocumentQueryDto,
  ): Promise<IcDocumentResponseDto> {
    return this.db.run(user, (tx) => this.loadDocument(tx, id, query));
  }

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

  private async loadDocument(tx: UserTx, id: string, query: GetIcDocumentQueryDto): Promise<IcDocumentResponseDto> {
    const filters = [eq(icDocument.icDocumentId, id)];
    if (query.scenarioId) filters.push(eq(icDocument.scenarioId, query.scenarioId));
    const versions = await tx
      .select()
      .from(icDocument)
      .where(and(...filters))
      .orderBy(desc(icDocument.version));
    if (versions.length === 0) throw new NotFoundException('Documento IC no encontrado');

    const current = versions.find((row) => row.statusCode !== 'ANULADA') ?? versions[0];
    const doc = query.version == null ? current : versions.find((row) => row.version === query.version);
    if (!doc) throw new NotFoundException('Documento IC no encontrado');

    const isCurrent = doc.version === current.version && current.statusCode !== 'ANULADA';
    const [write] = await tx.execute<{ canWrite: boolean }>(
      sql`select authz."canWriteCompany"(${doc.receiverCompanyId}) as "canWrite"`,
    );
    const canAct = Boolean(write?.canWrite) && isCurrent && doc.statusCode === 'PENDIENTE_ACEPTACION';

    const [receivableRow] = await tx
      .select()
      .from(icReceivable)
      .where(and(eq(icReceivable.icDocumentId, doc.icDocumentId), eq(icReceivable.version, doc.version)));
    const [payableRow] = await tx
      .select()
      .from(icPayable)
      .where(and(eq(icPayable.icDocumentId, doc.icDocumentId), eq(icPayable.version, doc.version)));

    const sourceRows = await tx
      .select({
        loadId: dataLoad.loadId,
        lineId: dataLoadLine.lineId,
        rowNumber: dataLoadLine.rowNumber,
        fileName: dataLoad.fileName,
      })
      .from(dataLoadLine)
      .innerJoin(dataLoad, eq(dataLoad.loadId, dataLoadLine.loadId))
      .where(eq(dataLoadLine.icDocumentId, doc.icDocumentId));

    return {
      icDocumentId: doc.icDocumentId,
      version: doc.version,
      isCurrent,
      scenarioId: doc.scenarioId,
      statusCode: doc.statusCode,
      statusReason: doc.statusReason,
      icDocumentTypeCode: doc.icDocumentTypeCode,
      issuerCompanyId: doc.issuerCompanyId,
      receiverCompanyId: doc.receiverCompanyId,
      transactionCurrencyCode: doc.transactionCurrencyCode,
      transactionAmount: doc.transactionAmount,
      periodCode: doc.periodCode,
      receivable: receivableRow ? toReceivable(receivableRow) : null,
      payable: payableRow ? toPayable(payableRow) : null,
      permissions: { canAccept: canAct, canDispute: canAct },
      sourceRefs: sourceRows.map(toSourceRef),
    };
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

function toReceivable(row: typeof icReceivable.$inferSelect): IcReceivableDto {
  return {
    companyId: row.companyId,
    partnerCompanyId: row.partnerCompanyId,
    currencyCode: row.currencyCode,
    amount: row.amount,
    balance: row.balance,
  };
}

function toPayable(row: typeof icPayable.$inferSelect): IcPayableDto {
  return {
    companyId: row.companyId,
    partnerCompanyId: row.partnerCompanyId,
    currencyCode: row.currencyCode,
    amount: row.amount,
    balance: row.balance,
    acceptedBy: row.acceptedBy,
    acceptedAt: row.acceptedAt,
  };
}

function toSourceRef(row: { loadId: string; lineId: string; rowNumber: number; fileName: string }): IcSourceRefDto {
  return { loadId: row.loadId, lineId: row.lineId, rowNumber: row.rowNumber, fileName: row.fileName };
}

function parseVersion(value: unknown): number {
  const version = typeof value === 'string' ? Number(value) : value;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BadRequestException('version debe ser un entero >= 1');
  }
  return version;
}
