import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/decorators';
import type { VerifiedUser } from '../auth/jwt-verifier';
import { varianceBridge, varianceBridgeEva, varianceBridgeLine, vVarianceBridgeCheck } from '../db/schema/schema';
import { UserDb } from '../db/user-db';

/** Explicador de desviaciones V1→V2 (lectura). Nivel grupo: requiere readAll (igual que RLS). */
@RequirePermission('readAll')
@Controller('bridges')
export class BridgesController {
  constructor(private readonly db: UserDb) {}

  @Get()
  list(@CurrentUser() user: VerifiedUser) {
    return this.db.run(user, (tx) => tx.select().from(varianceBridge).orderBy(desc(varianceBridge.createdAt)));
  }

  /** Bridge con sus líneas (Δ ventas / Δ EBIT por efecto) y el detalle de Δ EVA. */
  @Get(':bridgeId')
  async get(@CurrentUser() user: VerifiedUser, @Param('bridgeId', new ParseUUIDPipe()) bridgeId: string) {
    const result = await this.db.run(user, async (tx) => {
      const [bridge] = await tx.select().from(varianceBridge).where(eq(varianceBridge.bridgeId, bridgeId));
      if (!bridge) return undefined;
      const lines = await tx
        .select()
        .from(varianceBridgeLine)
        .where(eq(varianceBridgeLine.bridgeId, bridgeId))
        .orderBy(asc(varianceBridgeLine.bridgeLineId));
      const eva = await tx
        .select()
        .from(varianceBridgeEva)
        .where(eq(varianceBridgeEva.bridgeId, bridgeId))
        .orderBy(asc(varianceBridgeEva.effectCode), asc(varianceBridgeEva.scopeCode));
      return { ...bridge, lines, eva };
    });
    if (!result) throw new NotFoundException('Bridge no encontrado');
    return result;
  }

  /** Cuadre del bridge contra los KPIs de las dos corridas ("vVarianceBridgeCheck"). */
  @Get(':bridgeId/check')
  async check(@CurrentUser() user: VerifiedUser, @Param('bridgeId', new ParseUUIDPipe()) bridgeId: string) {
    const [row] = await this.db.run(user, (tx) =>
      tx.select().from(vVarianceBridgeCheck).where(eq(vVarianceBridgeCheck.bridgeId, bridgeId)),
    );
    if (!row) throw new NotFoundException('Bridge no encontrado');
    return row;
  }
}
