import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { UserDb } from '../db/user-db';
import { userCompanyAccess } from '../db/schema/schema';
import type { Permission } from './decorators';
import type { VerifiedUser } from './jwt-verifier';

export interface Grant {
  companyId: string | null;
  roleCode: string;
}

export interface UserAccess {
  grants: Grant[];
  permissions: Record<Permission, boolean>;
}

/**
 * Lee roles y permisos del usuario desde "userCompanyAccess" con su propio JWT (RLS),
 * nunca desde el JWT ni user_metadata. Los flags de grupo los calcula
 * authz."hasPermission" en SQL, igual que las policies (no se reimplementan aquí).
 */
@Injectable()
export class AccessService {
  constructor(private readonly db: UserDb) {}

  load(user: VerifiedUser): Promise<UserAccess> {
    return this.db.run(user, async (tx) => {
      const grants = await tx
        .select({ companyId: userCompanyAccess.companyId, roleCode: userCompanyAccess.roleCode })
        .from(userCompanyAccess)
        .where(and(eq(userCompanyAccess.userId, user.userId), eq(userCompanyAccess.isActive, true)))
        .orderBy(userCompanyAccess.accessId);
      const [flags] = await tx.execute<Record<Permission, boolean>>(sql`
        select authz."hasPermission"('readAll')      as "readAll",
               authz."hasPermission"('writeAll')     as "writeAll",
               authz."hasPermission"('approveLoads') as "approveLoads",
               authz."hasPermission"('masterData')   as "masterData"`);
      return { grants, permissions: { ...flags } };
    });
  }
}
