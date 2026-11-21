import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createMigratorClient } from '../../src/db/migrator-client';
import { testDatabaseUrl } from '../support/env';
import { IC_DOCUMENTS, SCENARIO, USERS } from '../support/fixtures';

/**
 * Recrea la base LOCAL de pruebas (stubs de Supabase + 01..05 + motor 07, sin 06) y carga fixtures con el
 * cliente migrador: usuarios en auth.users + "userCompanyAccess", hallazgos, documentos IC y
 * una corrida con un saldo consolidado para que "vGroupKpi" devuelva filas.
 */
export default async function globalSetup(): Promise<void> {
  const url = testDatabaseUrl();
  execFileSync('bash', [join(__dirname, '../local-db/setup-local-db.sh')], {
    env: { ...process.env, LOCAL_DB_URL: url },
    stdio: 'pipe',
  });

  const { sql, close } = createMigratorClient(url);
  try {
    for (const user of Object.values(USERS)) {
      await sql`insert into auth.users (id, email) values (${user.id}, ${`${user.id}@test.local`})`;
      if (user.roleCode) {
        await sql`insert into "userCompanyAccess" ("userId", "companyId", "roleCode") values (${user.id}, ${user.companyId}, ${user.roleCode})`;
      }
    }

    // Hallazgos: uno por carga GT1 y MX1 del escenario, y uno sin carga (solo readAll).
    for (const companyId of ['GT1', 'MX1']) {
      await sql`
        insert into "validationFinding" ("loadId", "scenarioId", "ruleCode", "severityCode", "companyCode", "recordRef", "message")
        select "loadId", "scenarioId", 'V01', 'B', "companyId", 'fixture#fila1', 'hallazgo de prueba'
          from "dataLoad" where "companyId" = ${companyId} and "scenarioId" = ${SCENARIO}
         order by "financialStatementCode" limit 1`;
    }
    await sql`
      insert into "validationFinding" ("loadId", "scenarioId", "ruleCode", "severityCode", "companyCode", "recordRef", "message")
      values (null, ${SCENARIO}, 'V01', 'B', null, 'tasas', 'hallazgo de grupo')`;

    for (const [id, issuer, receiver, finalStatus] of IC_DOCUMENTS) {
      await sql`
        insert into "icDocument" ("icDocumentId", "version", "scenarioId", "icDocumentTypeCode", "issuerCompanyId",
                                  "receiverCompanyId", "transactionCurrencyCode", "transactionAmount", "periodCode")
        values (${id}, 1, ${SCENARIO}, 'SERVICIO', ${issuer}, ${receiver}, 'USD', 1000, '2025-01')`;
      if (finalStatus === 'PENDIENTE_ACEPTACION') {
        await sql`update "icDocument" set "statusCode" = 'EMITIDA' where "icDocumentId" = ${id}`;
        await sql`update "icDocument" set "statusCode" = 'PENDIENTE_ACEPTACION' where "icDocumentId" = ${id}`;
      }
    }

    // Motor (QB-13/14): las cargas V2 no tienen hallazgos; se aprueban como hace el seed 06 (paso 4).
    await sql`update "dataLoad" set "statusCode" = 'APROBADA' where "scenarioId" = 'PPTO_V2'`;

    const [run] = await sql<{ runId: string }[]>`
      insert into "consolidationRun" ("scenarioId", "parameterSnapshot") values (${SCENARIO}, '{"WACC": 0.1}'::jsonb) returning "runId"`;
    await sql`
      insert into "consolidatedBalance" ("runId", "groupAccountId", "aggregatedUsd", "eliminationsUsd", "translationAdjustmentUsd")
      select ${run.runId}, g."groupAccountId", 1000, 0, 0
        from "groupAccount" g join "accountCategory" ac on ac."accountCategoryCode" = g."accountCategoryCode"
       where ac."isSales" order by g."groupAccountId" limit 1`;
    const [run2] = await sql<{ runId: string }[]>`
      insert into "consolidationRun" ("scenarioId", "parameterSnapshot") values ('PPTO_V2', '{"WACC": 0.1}'::jsonb) returning "runId"`;
    await sql`
      insert into "consolidatedBalance" ("runId", "groupAccountId", "aggregatedUsd", "eliminationsUsd", "translationAdjustmentUsd")
      select ${run2.runId}, "groupAccountId", 1500, 0, 0 from "consolidatedBalance" where "runId" = ${run.runId}`;
    await sql`insert into "varianceBridge" ("fromRunId", "toRunId", "notes") values (${run.runId}, ${run2.runId}, 'fixture')`;
  } finally {
    await close();
  }
}
