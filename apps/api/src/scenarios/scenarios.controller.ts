import { Controller, Get, Param } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { CurrentUser } from '../auth/current-user.decorator';
import type { VerifiedUser } from '../auth/jwt-verifier';
import { CodeParamPipe } from '../common/params';
import { validationFinding } from '../db/schema/schema';
import { UserDb } from '../db/user-db';

@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly db: UserDb) {}

  /** Hallazgos del escenario visibles por RLS (los de "loadId" null solo con readAll). */
  @Get(':scenarioId/findings')
  findings(@CurrentUser() user: VerifiedUser, @Param('scenarioId', CodeParamPipe) scenarioId: string) {
    return this.db.run(user, (tx) =>
      tx.select().from(validationFinding).where(eq(validationFinding.scenarioId, scenarioId)).orderBy(asc(validationFinding.findingId)),
    );
  }
}
