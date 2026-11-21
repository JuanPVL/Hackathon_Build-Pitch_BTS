import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BridgesController } from './bridges/bridges.controller';
import { CompaniesController } from './companies/companies.controller';
import { APP_CONFIG, loadConfig, type AppConfig } from './config/app-config';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';
import { IcDocumentsController } from './ic-documents/ic-documents.controller';
import { LoadsController } from './loads/loads.controller';
import { MeController } from './me/me.controller';
import { RunsController } from './runs/runs.controller';
import { ConsolidationController } from './scenarios/consolidation.controller';
import { ScenariosController } from './scenarios/scenarios.controller';

@Module({})
export class AppModule {
  static forConfig(config: AppConfig = loadConfig()) {
    return {
      module: AppModule,
      global: true,
      imports: [DbModule, AuthModule],
      controllers: [
        HealthController,
        MeController,
        CompaniesController,
        LoadsController, ScenariosController, ConsolidationController,
        RunsController,
        BridgesController,
        IcDocumentsController,
      ],
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
