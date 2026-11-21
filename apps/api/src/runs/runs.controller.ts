import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/decorators';
import type { VerifiedUser } from '../auth/jwt-verifier';
import { consolidationRun, vCompanyKpi, vGroupKpi } from '../db/schema/schema';
import { UserDb } from '../db/user-db';

@Controller('runs')
export class RunsController {
  constructor(private readonly db: UserDb) {}

  /** Corridas de consolidación (nivel grupo). Requiere readAll. */
  @RequirePermission('readAll')
  @Get()
  list(@CurrentUser() user: VerifiedUser) {
    return this.db.run(user, (tx) => tx.select().from(consolidationRun).orderBy(desc(consolidationRun.executedAt)));
  }

  /** KPIs de la corrida tal cual los calculan "vGroupKpi" y "vCompanyKpi" (Nest no recalcula). Requiere readAll. */
  @RequirePermission('readAll')
  @Get(':runId/kpis')
  async kpis(@CurrentUser() user: VerifiedUser, @Param('runId', new ParseUUIDPipe()) runId: string) {
    const result = await this.db.run(user, async (tx) => {
      const [run] = await tx.select().from(consolidationRun).where(eq(consolidationRun.runId, runId));
      if (!run) return undefined;
      const group = await tx.select().from(vGroupKpi).where(eq(vGroupKpi.runId, runId)).orderBy(asc(vGroupKpi.basisCode));
      const companies = await tx.select().from(vCompanyKpi).where(eq(vCompanyKpi.runId, runId)).orderBy(asc(vCompanyKpi.companyId));
      return { run, group, companies };
    });
    if (!result) throw new NotFoundException('Corrida no encontrada');
    return result;
  }
}
