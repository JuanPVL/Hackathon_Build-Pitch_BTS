import { Controller, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/decorators';
import type { VerifiedUser } from '../auth/jwt-verifier';
import { CodeParamPipe } from '../common/params';
import { toHttpError } from '../common/pg-errors';
import { consolidationRun, icReconciliation } from '../db/schema/schema';
import { UserDb } from '../db/user-db';

/**
 * QB-14. Lanza el motor SQL "fnConsolidar" (security invoker, RLS con el JWT del usuario):
 * crea SIEMPRE una corrida nueva e inmutable; nunca borra ni modifica corridas previas.
 * Nest no recalcula nada: devuelve la corrida creada y el resumen de su conciliación.
 * La conciliación ("fnConciliar") no tiene endpoint propio (PENDIENTE DECISIÓN AROLDO): corre dentro.
 */
@Controller('scenarios')
export class ConsolidationController {
  constructor(private readonly db: UserDb) {}

  @RequirePermission('writeAll')
  @Post(':scenarioId/consolidate')
  @HttpCode(201)
  async consolidate(@CurrentUser() user: VerifiedUser, @Param('scenarioId', CodeParamPipe) scenarioId: string) {
    try {
      return await this.db.run(user, async (tx) => {
        const [{ runId }] = await tx.execute<{ runId: string }>(sql`select "fnConsolidar"(${scenarioId}) as "runId"`);
        const [run] = await tx.select().from(consolidationRun).where(eq(consolidationRun.runId, runId));
        if (!run) throw new NotFoundException('Corrida no encontrada');
        const byStatus = await tx
          .select({ statusCode: icReconciliation.statusCode, count: sql<number>`count(*)::int` })
          .from(icReconciliation)
          .where(eq(icReconciliation.runId, runId))
          .groupBy(icReconciliation.statusCode);
        return { run, reconciliation: Object.fromEntries(byStatus.map((r) => [r.statusCode, r.count])) };
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }
}
