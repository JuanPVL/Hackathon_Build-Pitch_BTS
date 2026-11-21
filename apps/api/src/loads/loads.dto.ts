import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

const CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export class UploadLoadBodyDto {
  @ApiProperty({
    description: 'Código de la empresa a la que pertenece la carga (p. ej. GT1, MX1).',
    example: 'GT1',
  })
  @IsString()
  @Matches(CODE_RE, { message: 'companyId inválido' })
  companyId!: string;

  @ApiProperty({
    description: 'Código del escenario abierto (p. ej. PPTO_V1, PPTO_V2).',
    example: 'PPTO_V1',
  })
  @IsString()
  @Matches(CODE_RE, { message: 'scenarioId inválido' })
  scenarioId!: string;

  @ApiPropertyOptional({
    description: 'Estado financiero: PYG o BALANCE. Si se omite, se infiere del nombre del archivo (balance_* → BALANCE, presupuesto_* → PYG).',
    enum: ['PYG', 'BALANCE'],
    example: 'PYG',
  })
  @IsOptional()
  @IsString()
  @IsIn(['PYG', 'BALANCE', 'pyg', 'balance'], { message: 'financialStatementCode debe ser PYG o BALANCE' })
  financialStatementCode?: string;
}

export class UploadLoadMultipartDto extends UploadLoadBodyDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Archivo CSV UTF-8 con las 14 columnas del diccionario de datos (máx. 5 MB).',
  })
  file!: unknown;
}

export class UploadLoadResponseDto {
  @ApiProperty({ format: 'uuid', example: '11111111-2222-4333-8444-555555555555' })
  loadId!: string;

  @ApiProperty({ example: 'GT1' })
  companyId!: string;

  @ApiProperty({ example: 'PPTO_V1' })
  scenarioId!: string;

  @ApiProperty({ enum: ['PYG', 'BALANCE'], example: 'PYG' })
  financialStatementCode!: string;

  @ApiProperty({ example: 'presupuesto_GT1_V1.csv' })
  fileName!: string;

  @ApiProperty({ nullable: true, example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' })
  fileHash!: string | null;

  @ApiProperty({ example: 2, description: 'Versión asignada automáticamente (1..n); nunca sobrescribe una versión anterior.' })
  version!: number;

  @ApiProperty({ example: 'RECIBIDA' })
  statusCode!: string;

  @ApiProperty({ example: 96 })
  rowCount!: number;

  @ApiProperty({ format: 'uuid', nullable: true })
  uploadedBy!: string | null;

  @ApiProperty({ example: '2026-11-21T19:00:00.000Z' })
  uploadedAt!: string;
}

export class ValidationFindingItemDto {
  @ApiProperty({ example: 1 })
  findingId!: number;

  @ApiProperty({ format: 'uuid', nullable: true })
  loadId!: string | null;

  @ApiProperty({ nullable: true, example: 'PPTO_V1' })
  scenarioId!: string | null;

  @ApiProperty({ example: 'V07' })
  ruleCode!: string;

  @ApiProperty({ enum: ['B', 'A', 'I'], example: 'B' })
  severityCode!: string;

  @ApiProperty({ nullable: true, example: 'GT1' })
  companyCode!: string | null;

  @ApiProperty({ nullable: true, example: 'presupuesto_GT1_V1.csv#fila58' })
  recordRef!: string | null;

  @ApiProperty({ example: 'Monto negativo en 4.1.01 (Ventas a terceros)' })
  message!: string;

  @ApiProperty({ nullable: true, example: '-1,950,000.00' })
  foundValue!: string | null;

  @ApiProperty({ nullable: true, example: '> 0' })
  expectedValue!: string | null;

  @ApiProperty({ nullable: true })
  suggestion!: string | null;

  @ApiProperty({ example: '500000.01' })
  impactUsd!: string;

  @ApiProperty({ example: '2026-11-21T19:00:00.000Z' })
  createdAt!: string;
}

export class ValidationTotalsDto {
  @ApiProperty({ example: 0 })
  blocking!: number;

  @ApiProperty({ example: 0 })
  warnings!: number;

  @ApiProperty({ example: 0 })
  info!: number;
}

export class ValidateLoadResponseDto {
  @ApiProperty({ format: 'uuid', example: '11111111-2222-4333-8444-555555555555' })
  loadId!: string;

  @ApiProperty({ example: 'GT1' })
  companyId!: string;

  @ApiProperty({ example: 'PPTO_V1' })
  scenarioId!: string;

  @ApiProperty({ enum: ['PYG', 'BALANCE'], example: 'PYG' })
  financialStatementCode!: string;

  @ApiProperty({ example: 2 })
  version!: number;

  @ApiProperty({ enum: ['VALIDADA', 'CUARENTENA'], example: 'VALIDADA' })
  statusCode!: string;

  @ApiProperty({ type: ValidationTotalsDto })
  totals!: ValidationTotalsDto;

  @ApiProperty({ example: 0 })
  findingsCount!: number;

  @ApiProperty({ type: [ValidationFindingItemDto] })
  findings!: ValidationFindingItemDto[];
}

export class ApproveLoadBodyDto {
  @ApiPropertyOptional({
    description: 'Justificación opcional al aprobar (obligatoria si la transición requiere motivo).',
    example: 'Validación verificada sin hallazgos bloqueantes.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  justification?: string;

  @ApiPropertyOptional({
    description: 'Alias de justification para statusReason.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ApproveLoadResponseDto {
  @ApiProperty({ format: 'uuid', example: '11111111-2222-4333-8444-555555555555' })
  loadId!: string;

  @ApiProperty({ example: 'GT1' })
  companyId!: string;

  @ApiProperty({ example: 'PPTO_V1' })
  scenarioId!: string;

  @ApiProperty({ enum: ['PYG', 'BALANCE'], example: 'PYG' })
  financialStatementCode!: string;

  @ApiProperty({ example: 2 })
  version!: number;

  @ApiProperty({ example: 'APROBADA' })
  statusCode!: string;

  @ApiProperty({ nullable: true })
  statusReason!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  approvedBy!: string | null;

  @ApiProperty({ nullable: true, example: '2026-11-21T19:05:00.000Z' })
  approvedAt!: string | null;
}
