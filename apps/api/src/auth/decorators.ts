import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

export type Permission = 'readAll' | 'writeAll' | 'approveLoads' | 'masterData';

export const IS_PUBLIC = 'quadra:isPublic';
export const ALLOW_WITHOUT_GRANTS = 'quadra:allowWithoutGrants';
export const REQUIRED_PERMISSION = 'quadra:requiredPermission';

/** Ruta sin JWT (healthcheck y OpenAPI). En el documento aparece sin bearer. */
export const Public = () =>
  applyDecorators(SetMetadata(IS_PUBLIC, true), ApiOperation({ security: [] }));
/** Ruta que exige JWT válido pero no una fila en "userCompanyAccess" (p. ej. GET /me). */
export const AllowWithoutGrants = () => SetMetadata(ALLOW_WITHOUT_GRANTS, true);
/** Permiso de grupo evaluado por authz."hasPermission" en la base (fuente de verdad del RLS). */
export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRED_PERMISSION, permission);
