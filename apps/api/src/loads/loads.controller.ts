import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { and, asc, eq, type SQL } from 'drizzle-orm';
import { CurrentUser } from '../auth/current-user.decorator';
import type { VerifiedUser } from '../auth/jwt-verifier';
import { optionalCode } from '../common/params';
import { dataLoad, dataLoadLine } from '../db/schema/schema';
import { UserDb } from '../db/user-db';

/** It-0: cargas visibles para el usuario. El recorte por empresa lo hace RLS. */
@Controller('loads')
export class LoadsController {
  constructor(private readonly db: UserDb) {}

  @Get()
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
        .orderBy(asc(dataLoad.scenarioId), asc(dataLoad.companyId), asc(dataLoad.financialStatementCode), asc(dataLoad.version)),
    );
  }

  /** Detalle con sus líneas. Una carga que RLS no deja ver responde 404 (no se revela si existe). */
  @Get(':loadId')
  async get(@CurrentUser() user: VerifiedUser, @Param('loadId', new ParseUUIDPipe()) loadId: string) {
    const result = await this.db.run(user, async (tx) => {
      const [load] = await tx.select().from(dataLoad).where(eq(dataLoad.loadId, loadId));
      if (!load) return undefined;
      const lines = await tx.select().from(dataLoadLine).where(eq(dataLoadLine.loadId, loadId)).orderBy(asc(dataLoadLine.rowNumber));
      return { ...load, lines };
    });
    if (!result) throw new NotFoundException('Carga no encontrada');
    return result;
  }
}
