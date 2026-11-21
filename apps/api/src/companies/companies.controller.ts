import { Controller, Get } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { CurrentUser } from '../auth/current-user.decorator';
import { AllowWithoutGrants } from '../auth/decorators';
import type { VerifiedUser } from '../auth/jwt-verifier';
import { company } from '../db/schema/schema';
import { UserDb } from '../db/user-db';

/** Catálogo de empresas: RLS lo deja leer a todo usuario autenticado. */
@Controller('companies')
export class CompaniesController {
  constructor(private readonly db: UserDb) {}

  @AllowWithoutGrants()
  @Get()
  list(@CurrentUser() user: VerifiedUser) {
    return this.db.run(user, (tx) => tx.select().from(company).orderBy(asc(company.companyId)));
  }
}
