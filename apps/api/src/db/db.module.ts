import { Global, Module } from '@nestjs/common';
import { UserDb } from './user-db';

/** Solo expone el cliente de usuario. El migrador no se registra aquí a propósito. */
@Global()
@Module({ providers: [UserDb], exports: [UserDb] })
export class DbModule {}
