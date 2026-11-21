import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';

/** Query de GET /scenarios/:scenarioId/rates. */
export class GetRatesQueryDto {
  @ApiPropertyOptional({
    description: 'Periodo YYYY-MM. Si se omite, se devuelven todas las filas con su propio periodo, sin agregarlas a un número anual.',
    example: '2027-12',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'periodCode debe ser YYYY-MM' })
  periodCode?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Corrida cuya foto de tasas se quiere consultar. Solo hay ratesHash en consolidationRun; no existen tasas históricas por corrida. Si se envía, se devuelve el hash de esa corrida y las tasas actuales, con historicalSnapshot=false.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'runId inválido' })
  runId?: string;
}

export class ExchangeRateRowDto {
  @ApiProperty({ example: 'MXN' }) currencyCode!: string;
  @ApiProperty({ example: 'PRESUPUESTO', description: 'Código de rateType (PRESUPUESTO, CIERRE, HISTORICA, …).' })
  rateTypeCode!: string;
  @ApiProperty({ example: '2027-12' }) periodCode!: string;
  @ApiProperty({
    example: '0.0555555600',
    description: 'USD por una unidad de la moneda funcional (groupExchangeRate.rateToUsd). Decimal string. El front puede invertir para mostrar unidades por USD.',
  })
  usdPerUnit!: string;
}

export class ScenarioRatesResponseDto {
  @ApiProperty({ example: 'PPTO_V2' }) scenarioId!: string;
  @ApiProperty({ nullable: true, example: '2027-12', description: 'Periodo pedido, o null si se devolvieron todos.' })
  periodCode!: string | null;
  @ApiProperty({
    nullable: true,
    description:
      'Con runId: ratesHash guardado en la corrida. Sin runId: md5 actual de la tabla de tasas del escenario, la misma fórmula que fnConsolidationRunSnapshot. null si no hay filas de tasa.',
  })
  ratesHash!: string | null;
  @ApiProperty({
    description:
      'false: no hay foto histórica de tasas por corrida, solo el hash. Las filas son siempre las tasas actuales de groupExchangeRate (isActive).',
  })
  historicalSnapshot!: boolean;
  @ApiProperty({ type: [ExchangeRateRowDto] })
  rows!: ExchangeRateRowDto[];
  @ApiProperty({ type: [Object], description: 'No hay catálogo de reglas de conversión almacenado; siempre [].' })
  conversionRules!: unknown[];
  @ApiProperty({
    type: [Object],
    description: 'Solo hallazgos/reglas realmente ejecutados sobre tasas. Esta operación de lectura no inventa alertas; siempre [].',
  })
  alerts!: unknown[];
}
