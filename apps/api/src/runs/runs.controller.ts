import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/decorators';
import type { VerifiedUser } from '../auth/jwt-verifier';
import {
  consolidatedBalance,
  consolidationRun,
  consolidationRunLoad,
  dataLoad,
  elimination,
  groupAccount,
  icReconciliation,
  vCompanyKpi,
  vGroupKpi,
} from '../db/schema/schema';
import { UserDb, type UserTx } from '../db/user-db';

type Run = typeof consolidationRun.$inferSelect;

/** Corridas de consolidación (nivel grupo, readAll). Todo sale de tablas/vistas SQL: Nest no recalcula. */
@Controller('runs')
export class RunsController {
  constructor(private readonly db: UserDb) {}

  @RequirePermission('readAll')
  @Get()
  list(@CurrentUser() user: VerifiedUser) {
    return this.db.run(user, (tx) => tx.select().from(consolidationRun).orderBy(desc(consolidationRun.executedAt)));
  }

  /** QB-14: cabecera de la corrida (parámetros congelados, hash de tasas, lineageOk) y cargas incluidas. */
  @RequirePermission('readAll')
  @Get(':runId')
  get(@CurrentUser() user: VerifiedUser, @Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.forRun(user, runId, async (tx, run) => {
      const loads = await tx
        .select({
          loadId: dataLoad.loadId,
          companyId: dataLoad.companyId,
          financialStatementCode: dataLoad.financialStatementCode,
          version: dataLoad.version,
          fileName: dataLoad.fileName,
          statusCode: dataLoad.statusCode,
        })
        .from(consolidationRunLoad)
        .innerJoin(dataLoad, eq(dataLoad.loadId, consolidationRunLoad.loadId))
        .where(eq(consolidationRunLoad.runId, runId))
        .orderBy(asc(dataLoad.companyId), asc(dataLoad.financialStatementCode));
      return { run, loads };
    });
  }

  /** QB-14: consolidado por cuenta (agregado + eliminaciones + CTA = consolidado). */
  @RequirePermission('readAll')
  @Get(':runId/consolidated')
  consolidated(@CurrentUser() user: VerifiedUser, @Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.forRun(user, runId, async (tx, run) => {
      const accounts = await tx
        .select({
          groupAccountId: consolidatedBalance.groupAccountId,
          name: groupAccount.name,
          accountTypeCode: groupAccount.accountTypeCode,
          accountCategoryCode: groupAccount.accountCategoryCode,
          aggregatedUsd: consolidatedBalance.aggregatedUsd,
          eliminationsUsd: consolidatedBalance.eliminationsUsd,
          translationAdjustmentUsd: consolidatedBalance.translationAdjustmentUsd,
          consolidatedUsd: consolidatedBalance.consolidatedUsd,
        })
        .from(consolidatedBalance)
        .innerJoin(groupAccount, eq(groupAccount.groupAccountId, consolidatedBalance.groupAccountId))
        .where(eq(consolidatedBalance.runId, runId))
        .orderBy(asc(consolidatedBalance.groupAccountId));
      return { run, accounts };
    });
  }

  /** QB-14: asientos de eliminación (E1–E4, E7) de la corrida. */
  @RequirePermission('readAll')
  @Get(':runId/eliminations')
  eliminations(@CurrentUser() user: VerifiedUser, @Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.forRun(user, runId, async (tx, run) => {
      const rows = await tx
        .select()
        .from(elimination)
        .where(eq(elimination.runId, runId))
        .orderBy(asc(elimination.eliminationCode), asc(elimination.eliminationLineId));
      return { run, eliminations: rows };
    });
  }

  /** QB-13: conciliación IC por documento y estado financiero. */
  @RequirePermission('readAll')
  @Get(':runId/reconciliation')
  reconciliation(@CurrentUser() user: VerifiedUser, @Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.forRun(user, runId, async (tx, run) => {
      const rows = await tx
        .select()
        .from(icReconciliation)
        .where(eq(icReconciliation.runId, runId))
        .orderBy(asc(icReconciliation.icDocumentId), asc(icReconciliation.financialStatementCode));
      const summary: Record<string, number> = {};
      for (const r of rows) summary[r.statusCode] = (summary[r.statusCode] ?? 0) + 1;
      return { run, summary, reconciliation: rows };
    });
  }

  /**
   * QA-H4 / QB-13: matrices IC de ESTA corrida ("vIcBilledMatrixByRun" facturado P&L,
   * "vIcBalanceMatrixByRun" saldos). Foto de la corrida (sus cargas o, si no tiene,
   * la conciliación guardada), no las cargas APROBADA actuales del escenario.
   */
  @RequirePermission('readAll')
  @Get(':runId/ic-matrix')
  icMatrix(@CurrentUser() user: VerifiedUser, @Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.forRun(user, runId, async (tx, run) => {
      const billed = await tx.execute<{
        runId: string; issuerCompanyId: string; receiverCompanyId: string; billedUsd: string;
      }>(sql`
        select "runId", "issuerCompanyId", "receiverCompanyId", "billedUsd"
          from "vIcBilledMatrixByRun"
         where "runId" = ${runId}
         order by "issuerCompanyId", "receiverCompanyId"`);
      const balances = await tx.execute<{
        runId: string; companyId: string; partnerCompanyId: string; balanceUsd: string;
      }>(sql`
        select "runId", "companyId", "partnerCompanyId", "balanceUsd"
          from "vIcBalanceMatrixByRun"
         where "runId" = ${runId}
         order by "companyId", "partnerCompanyId"`);
      return { run: { runId: run.runId, scenarioId: run.scenarioId }, billed, balances };
    });
  }

  /** KPIs de la corrida tal cual los calculan "vGroupKpi" y "vCompanyKpi". */
  @RequirePermission('readAll')
  @Get(':runId/kpis')
  kpis(@CurrentUser() user: VerifiedUser, @Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.forRun(user, runId, async (tx, run) => {
      const group = await tx.select().from(vGroupKpi).where(eq(vGroupKpi.runId, runId)).orderBy(asc(vGroupKpi.basisCode));
      const companies = await tx.select().from(vCompanyKpi).where(eq(vCompanyKpi.runId, runId)).orderBy(asc(vCompanyKpi.companyId));
      return { run, group, companies };
    });
  }

  private async forRun<T>(user: VerifiedUser, runId: string, work: (tx: UserTx, run: Run) => Promise<T>): Promise<T> {
    const result = await this.db.run(user, async (tx) => {
      const [run] = await tx.select().from(consolidationRun).where(eq(consolidationRun.runId, runId));
      return run ? { value: await work(tx, run) } : undefined;
    });
    if (!result) throw new NotFoundException('Corrida no encontrada');
    return result.value;
  }
}
