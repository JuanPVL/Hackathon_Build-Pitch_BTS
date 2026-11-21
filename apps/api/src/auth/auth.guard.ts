import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AccessService, type UserAccess } from './access.service';
import { ALLOW_WITHOUT_GRANTS, IS_PUBLIC, REQUIRED_PERMISSION, type Permission } from './decorators';
import { InvalidTokenError, JwtVerifier, type VerifiedUser } from './jwt-verifier';

export interface AuthenticatedRequest extends Request {
  user: VerifiedUser;
  access?: UserAccess;
}

/**
 * Guard global. Orden:
 * 1. Sin `Authorization: Bearer` o token inválido / expirado / rol distinto de authenticated → 401,
 *    sin abrir transacción.
 * 2. Token válido sin fila activa en "userCompanyAccess" → 403 en rutas de negocio.
 * 3. Permiso de grupo requerido (readAll, writeAll…) ausente → 403.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifier,
    private readonly accessService: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Falta el token Bearer');
    try {
      request.user = await this.verifier.verify(token);
    } catch (error) {
      if (error instanceof InvalidTokenError) throw new UnauthorizedException(error.message);
      throw error;
    }

    if (this.reflector.getAllAndOverride<boolean>(ALLOW_WITHOUT_GRANTS, targets)) return true;

    const access = await this.accessService.load(request.user);
    if (access.grants.length === 0) throw new ForbiddenException('El usuario no tiene accesos en Quadra');
    const required = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, targets);
    if (required && !access.permissions[required]) throw new ForbiddenException(`Requiere el permiso ${required}`);
    request.access = access;
    return true;
  }
}

function bearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match?.[1];
}
