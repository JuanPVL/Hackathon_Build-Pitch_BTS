import { Controller, Get } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { CurrentUser } from '../auth/current-user.decorator';
import type { VerifiedUser } from '../auth/jwt-verifier';
import { company } from '../db/schema/schema';
import { UserDb } from '../db/user-db';

/** Catálogo de empresas. Exige JWT y al menos un grant; el RLS deja leer el catálogo a authenticated. */
@Controller('companies')
export class CompaniesController {
  constructor(private readonly db: UserDb) {}

  @Get()
  list(@CurrentUser() user: VerifiedUser) {
    return this.db.run(user, (tx) => tx.select().from(company).orderBy(asc(company.companyId)));
  }
}
