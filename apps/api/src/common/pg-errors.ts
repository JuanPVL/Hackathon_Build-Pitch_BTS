import { ConflictException, ForbiddenException, HttpException } from '@nestjs/common';

/** Código SQLSTATE de un error de postgres.js, venga directo o envuelto por Drizzle. */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Traduce los errores que lanzan las funciones SQL a HTTP; el resto se relanza tal cual. */
export function toHttpError(error: unknown): unknown {
  if (error instanceof HttpException) return error;
  switch (pgErrorCode(error)) {
    case '42501': // insufficient_privilege (RLS / función)
      return new ForbiddenException('Sin permiso sobre este recurso');
    case '23514': // check_violation: estado ilegal según la máquina de estados
    case '40001':
      return new ConflictException('La operación no es válida para el estado actual');
    default:
      return error;
  }
}
