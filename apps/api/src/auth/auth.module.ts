import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { AccessService } from './access.service';
import { AuthGuard } from './auth.guard';
import { JwtVerifier } from './jwt-verifier';

@Global()
@Module({
  providers: [
    { provide: JwtVerifier, inject: [APP_CONFIG], useFactory: (config: AppConfig) => new JwtVerifier(config.auth) },
    AccessService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [JwtVerifier, AccessService],
})
export class AuthModule {}
