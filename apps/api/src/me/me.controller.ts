import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { AccessService } from '../auth/access.service';
import { AllowWithoutGrants } from '../auth/decorators';
import { CurrentUser } from '../auth/current-user.decorator';
import type { VerifiedUser } from '../auth/jwt-verifier';
import { UserDb } from '../db/user-db';

/**
 * Quién soy para la base: el `sub` del JWT, lo que ve audit."currentUserId"() dentro de la
 * transacción RLS y mis accesos. No exige grants para que el front pueda mostrar "sin acceso".
 */
@Controller('me')
export class MeController {
  constructor(
    private readonly db: UserDb,
    private readonly access: AccessService,
  ) {}

  @AllowWithoutGrants()
  @Get()
  async me(@CurrentUser() user: VerifiedUser) {
    const [row] = await this.db.run(user, (tx) =>
      tx.execute<{ dbUserId: string | null; dbRole: string }>(
        sql`select audit."currentUserId"() as "dbUserId", current_user as "dbRole"`,
      ),
    );
    const access = await this.access.load(user);
    return { userId: user.userId, dbUserId: row.dbUserId, dbRole: row.dbRole, ...access };
  }
}
