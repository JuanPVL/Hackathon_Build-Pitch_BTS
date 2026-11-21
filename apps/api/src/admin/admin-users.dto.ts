import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const ACCESS_ROLES = [
  'GROUP_CONTROLLER',
  'AUDITOR',
  'COMPANY_ACCOUNTANT',
  'COMPANY_VIEWER',
] as const;

export type AccessRoleCode = (typeof ACCESS_ROLES)[number];

export const GROUP_ROLES = new Set<AccessRoleCode>(['GROUP_CONTROLLER', 'AUDITOR']);
export const COMPANY_ROLES = new Set<AccessRoleCode>(['COMPANY_ACCOUNTANT', 'COMPANY_VIEWER']);

const CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export class UserAccessGrantDto {
  @ApiProperty({ example: 1 })
  accessId!: number;

  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  userId!: string;

  @ApiProperty({
    nullable: true,
    example: 'GT1',
    description: 'Código de empresa para roles locales (COMPANY_ACCOUNTANT, COMPANY_VIEWER), o null para roles de grupo (GROUP_CONTROLLER, AUDITOR).',
  })
  companyId!: string | null;

  @ApiProperty({ enum: ACCESS_ROLES, example: 'COMPANY_ACCOUNTANT' })
  roleCode!: AccessRoleCode;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-11-21T19:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  createdBy!: string | null;

  @ApiProperty({ nullable: true })
  updatedAt!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  updatedBy!: string | null;
}

export class AdminUserDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  userId!: string;

  @ApiProperty({ nullable: true, example: 'contador.gt1@quadra.demo' })
  email!: string | null;

  @ApiProperty({
    enum: ACCESS_ROLES,
    nullable: true,
    example: 'COMPANY_ACCOUNTANT',
    description: 'Rol activo principal del usuario, o null si sus accesos fueron revocados.',
  })
  roleCode!: AccessRoleCode | null;

  @ApiProperty({
    nullable: true,
    example: 'GT1',
    description: 'Empresa asignada al rol activo, o null para roles de grupo o sin acceso activo.',
  })
  companyId!: string | null;

  @ApiProperty({
    example: true,
    description: 'True si el usuario tiene al menos un acceso activo en userCompanyAccess.',
  })
  isActive!: boolean;

  @ApiProperty({ type: [UserAccessGrantDto] })
  grants!: UserAccessGrantDto[];
}

export class CreateAdminUserBodyDto {
  @ApiProperty({
    description: 'Correo electrónico del nuevo usuario.',
    example: 'nuevo.contador@quadra.demo',
  })
  @IsEmail({}, { message: 'email debe ser un correo válido' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    description: 'Contraseña temporal para el usuario en Supabase Auth (mínimo 8 caracteres).',
    example: 'Quadra2026!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'password debe tener al menos 8 caracteres' })
  @MaxLength(128)
  password!: string;

  @ApiProperty({
    description: 'Rol asignado en userCompanyAccess.',
    enum: ACCESS_ROLES,
    example: 'COMPANY_ACCOUNTANT',
  })
  @IsString()
  @IsIn([...ACCESS_ROLES], { message: 'roleCode inválido' })
  roleCode!: AccessRoleCode;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Empresa asignada (obligatoria para COMPANY_ACCOUNTANT / COMPANY_VIEWER; null para GROUP_CONTROLLER / AUDITOR).',
    example: 'GT1',
  })
  @ValidateIf((o: CreateAdminUserBodyDto) => o.companyId !== null && o.companyId !== undefined && o.companyId !== '')
  @IsString()
  @Matches(CODE_RE, { message: 'companyId inválido' })
  companyId?: string | null;
}

export class UpdateAdminUserAccessBodyDto {
  @ApiPropertyOptional({
    description: 'Nuevo rol a asignar en userCompanyAccess.',
    enum: ACCESS_ROLES,
    example: 'COMPANY_VIEWER',
  })
  @IsOptional()
  @IsString()
  @IsIn([...ACCESS_ROLES], { message: 'roleCode inválido' })
  roleCode?: AccessRoleCode;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Nueva empresa asignada (null para roles de grupo).',
    example: 'MX1',
  })
  @ValidateIf((o: UpdateAdminUserAccessBodyDto) => o.companyId !== null && o.companyId !== undefined && o.companyId !== '')
  @IsString()
  @Matches(CODE_RE, { message: 'companyId inválido' })
  companyId?: string | null;

  @ApiPropertyOptional({
    description: 'Si es false, revoca todos los accesos activos del usuario sin borrar el historial.',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;
}
