import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

/** Query de GET /ic-documents/:icDocumentId. version y scenarioId son opcionales. */
export class GetIcDocumentQueryDto {
  @ApiPropertyOptional({
    description:
      'Versión concreta del documento. Si se omite, se resuelve la vigente: la mayor versión que no está ANULADA, en el escenario indicado si viene scenarioId. No se asume MAX(version) a ciegas.',
    example: 2,
    minimum: 1,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional({
    description: 'Desambigua el documento cuando el mismo código existe en más de un escenario.',
    example: 'PPTO_V2',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]{1,64}$/, { message: 'scenarioId inválido' })
  scenarioId?: string;
}

export class IcDocumentPermissionsDto {
  @ApiProperty({
    description: 'El usuario puede aceptar esta versión: es la vigente, está en PENDIENTE_ACEPTACION y tiene canWrite sobre la empresa receptora.',
  })
  canAccept!: boolean;

  @ApiProperty({
    description: 'El usuario puede disputar esta versión: mismas condiciones que canAccept. El POST /dispute sigue exigiendo reason.',
  })
  canDispute!: boolean;
}

export class IcReceivableDto {
  @ApiProperty() companyId!: string;
  @ApiProperty() partnerCompanyId!: string;
  @ApiProperty({ description: 'Moneda de la pata (la del documento). No hay moneda funcional ni monto USD almacenados en icReceivable.' })
  currencyCode!: string;
  @ApiProperty({ description: 'Monto en decimal string, como lo guarda PostgreSQL.' })
  amount!: string;
  @ApiProperty({ description: 'Saldo en decimal string. Nunca se sustituye un null por cero.' })
  balance!: string;
}

export class IcPayableDto {
  @ApiProperty() companyId!: string;
  @ApiProperty() partnerCompanyId!: string;
  @ApiProperty({ description: 'Moneda de la pata (la del documento). No hay moneda funcional ni monto USD almacenados en icPayable.' })
  currencyCode!: string;
  @ApiProperty({ description: 'Monto en decimal string, como lo guarda PostgreSQL.' })
  amount!: string;
  @ApiProperty() balance!: string;
  @ApiProperty({ nullable: true, format: 'uuid', description: 'Usuario que aceptó la pata por pagar. null si aún no hay aceptación.' })
  acceptedBy!: string | null;
  @ApiProperty({ nullable: true, description: 'Fecha ISO 8601 UTC de aceptación, o null.' })
  acceptedAt!: string | null;
}

export class IcSourceRefDto {
  @ApiProperty({ format: 'uuid' }) loadId!: string;
  @ApiProperty() lineId!: string;
  @ApiProperty() rowNumber!: number;
  @ApiProperty() fileName!: string;
}

export class IcDocumentResponseDto {
  @ApiProperty({ example: 'IC-F1-2027-12' }) icDocumentId!: string;
  @ApiProperty({ example: 2 }) version!: number;
  @ApiProperty({ description: 'True si esta versión es la vigente (mayor versión no ANULADA del contexto).' })
  isCurrent!: boolean;
  @ApiProperty({ example: 'PPTO_V2' }) scenarioId!: string;
  @ApiProperty({ example: 'PENDIENTE_ACEPTACION', description: 'Código real del catálogo IC_DOCUMENT. No se infiere desde icReconciliation.' })
  statusCode!: string;
  @ApiProperty({ nullable: true }) statusReason!: string | null;
  @ApiProperty({ example: 'SERVICIO' }) icDocumentTypeCode!: string;
  @ApiProperty({ example: 'GT1' }) issuerCompanyId!: string;
  @ApiProperty({ example: 'MX1' }) receiverCompanyId!: string;
  @ApiProperty({ example: 'USD' }) transactionCurrencyCode!: string;
  @ApiProperty({ description: 'Monto pactado en decimal string.', example: '20000.00' })
  transactionAmount!: string;
  @ApiProperty({ example: '2027-12' }) periodCode!: string;
  @ApiProperty({ type: IcReceivableDto, nullable: true, description: 'Pata por cobrar visible para el usuario, o null si no existe o RLS no la deja ver.' })
  receivable!: IcReceivableDto | null;
  @ApiProperty({ type: IcPayableDto, nullable: true, description: 'Pata por pagar visible para el usuario, o null si no existe o RLS no la deja ver.' })
  payable!: IcPayableDto | null;
  @ApiProperty({ type: IcDocumentPermissionsDto })
  permissions!: IcDocumentPermissionsDto;
  @ApiProperty({ type: [IcSourceRefDto], description: 'Líneas de carga visibles (RLS) que referencian este icDocumentId. Vacío si no hay.' })
  sourceRefs!: IcSourceRefDto[];
}
