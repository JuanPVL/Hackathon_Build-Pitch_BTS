import { Controller, Get, NotFoundException, Param, Query, ValidationPipe } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, asc, eq, sql } from 'drizzle-orm';
import { CurrentUser } from '../auth/current-user.decorator';
import type { VerifiedUser } from '../auth/jwt-verifier';
import { CodeParamPipe } from '../common/params';
import { consolidationRun, groupExchangeRate, scenario, validationFinding } from '../db/schema/schema';
import { UserDb } from '../db/user-db';
import { GetRatesQueryDto, ScenarioRatesResponseDto } from './rates.dto';

const queryPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false });

@ApiTags('scenarios')
@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly db: UserDb) {}

  /** Hallazgos del escenario visibles por RLS (los de "loadId" null solo con readAll). */
  @Get(':scenarioId/findings')
  findings(@CurrentUser() user: VerifiedUser, @Param('scenarioId', CodeParamPipe) scenarioId: string) {
    return this.db.run(user, (tx) =>
      tx.select().from(validationFinding).where(eq(validationFinding.scenarioId, scenarioId)).orderBy(asc(validationFinding.findingId)),
    );
  }

  @Get(':scenarioId/rates')
  @ApiOperation({
    summary: 'Tasas del escenario por periodo',
    description:
      'Devuelve groupExchangeRate activas, con usdPerUnit = rateToUsd (USD por una unidad funcional). ' +
      'Sin periodCode, incluye todas las filas con su periodo; no las agrega. ' +
      'No hay foto histórica de tasas por corrida: con runId se devuelve el ratesHash de esa corrida y las tasas actuales, historicalSnapshot=false.',
  })
  @ApiOkResponse({ type: ScenarioRatesResponseDto })
  @ApiBadRequestResponse({ description: 'scenarioId, periodCode o runId inválidos.' })
  @ApiNotFoundResponse({ description: 'El escenario no existe, o runId no es visible o no pertenece al escenario.' })
  getRates(
    @CurrentUser() user: VerifiedUser,
    @Param('scenarioId', CodeParamPipe) scenarioId: string,
    @Query(queryPipe) query: GetRatesQueryDto,
  ): Promise<ScenarioRatesResponseDto> {
    return this.db.run(user, async (tx) => {
      const [exists] = await tx
        .select({ scenarioId: scenario.scenarioId })
        .from(scenario)
        .where(eq(scenario.scenarioId, scenarioId));
      if (!exists) throw new NotFoundException('Escenario no encontrado');

      let ratesHash: string | null = null;
      if (query.runId) {
        const [run] = await tx
          .select({ ratesHash: consolidationRun.ratesHash, scenarioId: consolidationRun.scenarioId })
          .from(consolidationRun)
          .where(eq(consolidationRun.runId, query.runId));
        if (!run || run.scenarioId !== scenarioId) throw new NotFoundException('Corrida no encontrada');
        ratesHash = run.ratesHash;
      }

      const filters = [eq(groupExchangeRate.scenarioId, scenarioId), eq(groupExchangeRate.isActive, true)];
      if (query.periodCode) filters.push(eq(groupExchangeRate.periodCode, query.periodCode));
      const rateRows = await tx
        .select({
          currencyCode: groupExchangeRate.currencyCode,
          rateTypeCode: groupExchangeRate.rateTypeCode,
          periodCode: groupExchangeRate.periodCode,
          usdPerUnit: groupExchangeRate.rateToUsd,
        })
        .from(groupExchangeRate)
        .where(and(...filters))
        .orderBy(
          asc(groupExchangeRate.periodCode),
          asc(groupExchangeRate.currencyCode),
          asc(groupExchangeRate.rateTypeCode),
        );

      if (!query.runId) {
        const [hashRow] = await tx.execute<{ ratesHash: string | null }>(sql`
          select md5(string_agg(concat_ws('|', "periodCode", "currencyCode", "rateTypeCode", "rateToUsd"), ','
                                order by "periodCode", "currencyCode", "rateTypeCode")) as "ratesHash"
            from "groupExchangeRate"
           where "scenarioId" = ${scenarioId}`);
        ratesHash = hashRow?.ratesHash ?? null;
      }

      return {
        scenarioId,
        periodCode: query.periodCode ?? null,
        ratesHash,
        historicalSnapshot: false,
        rows: rateRows,
        conversionRules: [],
        alerts: [],
      };
    });
  }
}
