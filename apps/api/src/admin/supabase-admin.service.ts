import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

export interface SupabaseAuthUser {
  id: string;
  email: string;
  createdAt?: string | null;
}

/**
 * Cliente del Admin API de Supabase Auth (`/auth/v1/admin/users`).
 * Solo se invoca desde el servidor con `SUPABASE_SECRET_KEY` (nunca en el front).
 */
@Injectable()
export class SupabaseAdminService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private requireCredentials(): { supabaseUrl: string; secretKey: string } {
    if (!this.config.supabaseUrl || !this.config.supabaseSecretKey) {
      throw new ServiceUnavailableException(
        'SUPABASE_URL y SUPABASE_SECRET_KEY deben estar configurados en el servidor para administrar usuarios',
      );
    }
    return {
      supabaseUrl: this.config.supabaseUrl.replace(/\/+$/, ''),
      secretKey: this.config.supabaseSecretKey,
    };
  }

  /** Lista los usuarios de Supabase Auth si las credenciales están disponibles; si no, devuelve vacío. */
  async listAuthUsers(): Promise<SupabaseAuthUser[]> {
    if (!this.config.supabaseUrl || !this.config.supabaseSecretKey) {
      return [];
    }
    const { supabaseUrl, secretKey } = this.requireCredentials();
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=500`, {
      method: 'GET',
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new BadGatewayException(`Error al consultar usuarios en Supabase Auth (HTTP ${res.status})`);
    }
    const data = (await res.json().catch(() => null)) as
      | SupabaseAuthUser[]
      | { users?: Array<{ id?: string; email?: string; created_at?: string; createdAt?: string }> }
      | null;
    const rawList = Array.isArray(data) ? data : Array.isArray(data?.users) ? data.users : [];
    return rawList
      .filter((u): u is { id: string; email?: string; created_at?: string; createdAt?: string } => typeof u?.id === 'string')
      .map((u) => ({
        id: u.id,
        email: typeof u.email === 'string' ? u.email : '',
        createdAt: u.created_at ?? u.createdAt ?? null,
      }));
  }

  /**
   * Crea un usuario en Supabase Auth con email confirmado y contraseña temporal.
   * Si el correo ya existe en Auth, lanza 409 ConflictException.
   */
  async createAuthUser(email: string, temporaryPassword: string): Promise<SupabaseAuthUser> {
    const { supabaseUrl, secretKey } = this.requireCredentials();
    const normalizedEmail = email.trim().toLowerCase();

    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: normalizedEmail,
        password: temporaryPassword,
        email_confirm: true,
      }),
    });

    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      json = null;
    }

    if (res.ok && typeof json?.id === 'string') {
      return {
        id: json.id,
        email: typeof json.email === 'string' ? json.email : normalizedEmail,
        createdAt:
          typeof json.created_at === 'string'
            ? json.created_at
            : typeof json.createdAt === 'string'
              ? json.createdAt
              : null,
      };
    }

    const rawMsg = JSON.stringify(json ?? text);
    const alreadyExists =
      res.status === 409 ||
      res.status === 422 ||
      /already|registered|exists|duplicate/i.test(rawMsg);
    if (alreadyExists) {
      throw new ConflictException(`El correo ${normalizedEmail} ya está registrado`);
    }

    throw new BadGatewayException(
      `No se pudo crear el usuario en Supabase Auth (HTTP ${res.status})`,
    );
  }
}
