-- =====================================================================
-- 07_motor_conciliar_consolidar.sql — QB-13 (fnConciliar) y QB-14 (fnConsolidar)
-- Corre DESPUÉS de 01..05 (y convive con 06). NO se ha aplicado a la base en vivo:
-- aplicarlo allí es decisión de Aroldo. Solo crea funciones; no toca datos.
--
-- Reglas (oráculo: referencia/motor_referencia.py, funciones convertir / conciliar_y_eliminar /
-- consolidar / linaje):
--   * Una corrida es INMUTABLE y SIEMPRE nueva: fnConsolidar nunca borra ni modifica corridas
--     previas (las del seed 06 incluidas). Parámetros y hash de tasas los congela el trigger
--     trgConsolidationRunSnapshot; la conciliación usa las tolerancias de ese snapshot.
--   * Entran SOLO cargas consolidables (APROBADA) del escenario, vía consolidationRunLoad.
--   * Conversión: moneda FUNCIONAL de la empresa; P&L a PRESUPUESTO, balance a CIERRE,
--     patrimonio 3100 a HISTÓRICA (vMappedLine."requiredRateTypeCode").
--   * REDONDEO: cada línea se convierte y se redondea a centavos (round(amount*rate, 2)), igual que
--     vLineUsd. Agregados, eliminaciones, CTA y linaje se calculan con esos centavos, así
--     Σ linaje = consolidado es exacto (lineageOk con ±0.01). El oráculo Python NO redondea: la
--     diferencia por cuenta es la suma de errores de redondeo por línea (< 1 USD por cuenta).
--     Los ESTADOS de conciliación se deciden con el USD sin redondear (como el oráculo), para que
--     el corte CONCILIADO (|Δ| < 0.005) y las tolerancias den el mismo resultado; los montos que se
--     guardan y eliminan son los redondeados. La E7 se genera cuando la diferencia en centavos ≠ 0
--     (así cada asiento cuadra al centavo).
--   * Eliminaciones: solo E1–E4 y E7 (sin E5 dividendos ni E6 utilidad no realizada). Regla por
--     cuenta de grupo de la pata emisora: 4200/4300 → E1, 1250 → E2, 1600 → E3, 7300 → E4.
--     Diferencia FX: 7900 (P&L) o 3900 (balance), companyId null (nivel grupo).
--   * CTA: plug en 3900 = Σ ACT − Σ (PAS + PAT) tras eliminaciones.
-- Seguridad: SECURITY INVOKER (RLS aplica): crear corridas exige escritura de grupo (writeAll).
-- =====================================================================

-- Líneas de las cargas de una corrida, convertidas a USD (crudo y redondeado).
create or replace function "fnRunLineUsd"(pRunId uuid)
returns table (
  "lineId" text, "loadId" uuid, "fileName" text, "rowNumber" int, "companyId" text,
  "groupAccountId" text, "accountTypeCode" text, "isIntercompany" boolean,
  "financialStatementCode" text, "periodCode" text, "icDocumentId" text, "icPartnerCode" text,
  "transactionAmount" numeric, "amount" numeric, "currencyCode" text, "rate" numeric,
  "usdRaw" numeric, "usd" numeric)
language sql stable set search_path = public, pg_temp as $$
  -- Misma lógica que vMappedLine + vLineUsd, pero partiendo de las cargas de la corrida: así el
  -- planificador entra por "dataLoadLine"("loadId") (la vista completa + RLS sin estadísticas tardaba segundos).
  select l."lineId", l."loadId", d."fileName", l."rowNumber", d."companyId",
         m."groupAccountId", g."accountTypeCode", coalesce(g."isIntercompany", false),
         d."financialStatementCode", l."periodCode", nullif(btrim(l."icDocumentId"), ''), l."icPartnerCode",
         l."transactionAmount", l."amount", c."functionalCurrencyCode", r."rateToUsd",
         l."amount" * r."rateToUsd", round(l."amount" * r."rateToUsd", 2)
  from "consolidationRun" cr
  join "consolidationRunLoad" rl on rl."runId" = cr."runId"
  join "dataLoad" d on d."loadId" = rl."loadId"
  join "dataLoadLine" l on l."loadId" = rl."loadId"
  join "company" c on c."companyId" = d."companyId"
  join "financialStatement" fs on fs."financialStatementCode" = d."financialStatementCode"
  left join "accountMapping" m on m."countryCode" = c."countryCode" and m."localAccountCode" = l."localAccountCode"
  left join "groupAccount" g on g."groupAccountId" = m."groupAccountId"
  left join "groupExchangeRate" r
    on r."scenarioId" = cr."scenarioId" and r."periodCode" = l."periodCode"
   and r."currencyCode" = c."functionalCurrencyCode"
   and r."rateTypeCode" = coalesce(g."rateTypeCode", fs."defaultRateTypeCode")
  where cr."runId" = pRunId
$$;
comment on function "fnRunLineUsd"(uuid) is 'Lines of the loads attached to a run, translated to USD (raw and rounded to cents). Helper of fnConciliar / fnConsolidar.';

-- QB-13: conciliación IC de una corrida. Llena icReconciliation (una vez por corrida).
create or replace function "fnConciliar"(pRunId uuid) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  vSnapshot jsonb; vTolUsd numeric; vTolPct numeric; vResult jsonb;
begin
  select "parameterSnapshot" into vSnapshot from "consolidationRun" where "runId" = pRunId;
  if not found then
    raise exception using errcode = 'no_data_found', message = format('Run %s not found', pRunId);
  end if;
  if exists (select 1 from "icReconciliation" where "runId" = pRunId) then
    raise exception using errcode = 'check_violation', message = format('Run %s is already reconciled (runs are immutable)', pRunId);
  end if;
  vTolUsd := (vSnapshot ->> 'TOLERANCIA_FX_USD')::numeric;
  vTolPct := (vSnapshot ->> 'TOLERANCIA_FX_PCT')::numeric;
  if vTolUsd is null or vTolPct is null then
    raise exception using errcode = 'check_violation', message = 'Run has no TOLERANCIA_FX_USD / TOLERANCIA_FX_PCT in its parameter snapshot';
  end if;

  create temp table if not exists "tmpIcLine" on commit drop as select * from "fnRunLineUsd"(pRunId) limit 0;
  truncate "tmpIcLine";
  insert into "tmpIcLine" select * from "fnRunLineUsd"(pRunId) l where l."isIntercompany" and l."icDocumentId" is not null;

  insert into "icReconciliation" ("runId", "icDocumentId", "financialStatementCode", "issuerCompanyId", "receiverCompanyId",
                                  "statusCode", "issuerUsd", "receiverUsd", "differenceUsd", "lineRefs")
  with ic as (
    select l.*, (l."accountTypeCode" in ('ING', 'ACT')) as "isIssuerLeg",
           (l."accountTypeCode" in ('GAS', 'PAS')) as "isReceiverLeg"
    from "tmpIcLine" l
  ), g as (
    select "icDocumentId", "financialStatementCode",
           count(*) filter (where "isIssuerLeg") as na, count(*) filter (where "isReceiverLeg") as nb,
           sum("usd") filter (where "isIssuerLeg") as "sumA", sum("usd") filter (where "isReceiverLeg") as "sumB",
           string_agg("lineId", ';' order by "fileName", "rowNumber") as refs,
           (array_agg("companyId" order by "fileName", "rowNumber"))[1] as "firstCompany",
           (array_agg("icPartnerCode" order by "fileName", "rowNumber"))[1] as "firstPartner"
    from ic group by 1, 2
  ), paired as (
    select g.*, a."companyId" as "aCompany", b."companyId" as "bCompany",
           a."usd" as "aUsd", b."usd" as "bUsd", a."usdRaw" as "aRaw", b."usdRaw" as "bRaw",
           a."transactionAmount" as "aTx", b."transactionAmount" as "bTx",
           a."periodCode" as "aPeriod", b."periodCode" as "bPeriod", a."lineId" as "aLine", b."lineId" as "bLine"
    from g
    left join ic a on g.na = 1 and g.nb = 1 and a."icDocumentId" = g."icDocumentId"
                  and a."financialStatementCode" = g."financialStatementCode" and a."isIssuerLeg"
    left join ic b on g.na = 1 and g.nb = 1 and b."icDocumentId" = g."icDocumentId"
                  and b."financialStatementCode" = g."financialStatementCode" and b."isReceiverLeg"
  )
  select pRunId, "icDocumentId", "financialStatementCode",
         case when na = 1 and nb = 1 then "aCompany" when na > 0 then "firstCompany" else "firstPartner" end,
         case when na = 1 and nb = 1 then "bCompany" when na > 0 then "firstPartner" else "firstCompany" end,
         case
           when na <> 1 or nb <> 1 then 'SIN_CONTRAPARTE'
           when abs(coalesce("aTx", 0) - coalesce("bTx", 0)) > 0.01 then 'DIFERENCIA_MONTO'
           when "aPeriod" is distinct from "bPeriod" then 'DIFERENCIA_CORTE'
           when abs("aRaw" - "bRaw") <= vTolUsd or abs("aRaw" - "bRaw") <= vTolPct * abs("aRaw") then
             case when abs("aRaw" - "bRaw") < 0.005 then 'CONCILIADO' else 'CONCILIADO_FX' end
           else 'FX_FUERA_TOLERANCIA'
         end,
         case when na = 1 and nb = 1 then "aUsd" else coalesce("sumA", 0) end,
         case when na = 1 and nb = 1 then "bUsd" else coalesce("sumB", 0) end,
         case when na = 1 and nb = 1 then "aUsd" - "bUsd" else coalesce("sumA", 0) - coalesce("sumB", 0) end,
         case when na = 1 and nb = 1 then "aLine" || ';' || "bLine" else refs end
  from paired;

  select jsonb_build_object('runId', pRunId, 'total', count(*),
           'byStatus', coalesce(jsonb_object_agg("statusCode", n) filter (where "statusCode" is not null), '{}'::jsonb))
    into vResult
    from (select "statusCode", count(*) as n from "icReconciliation" where "runId" = pRunId group by 1) s
    right join (select 1) one on true;
  select jsonb_set(vResult, '{total}', to_jsonb((select count(*) from "icReconciliation" where "runId" = pRunId))) into vResult;
  return vResult;
end $$;
comment on function "fnConciliar"(uuid) is 'QB-13: IC reconciliation of a run (per document and statement) with the run''s frozen FX tolerances. Fills icReconciliation once; returns counts by status.';

-- QB-14: consolidación. Crea SIEMPRE una corrida nueva y devuelve su runId.
create or replace function "fnConsolidar"(pScenarioId text) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare
  vRunId uuid; vMissing int; vPlug numeric; vBad int;
begin
  if not exists (select 1 from "scenario" where "scenarioId" = pScenarioId) then
    raise exception using errcode = 'no_data_found', message = format('Scenario %s not found', pScenarioId);
  end if;
  if not exists (select 1 from "dataLoad" d join "status" s on s."domainCode" = 'LOAD' and s."statusCode" = d."statusCode"
                  where d."scenarioId" = pScenarioId and s."isConsolidable") then
    raise exception using errcode = 'check_violation',
      message = format('Scenario %s has no approved (APROBADA) loads to consolidate', pScenarioId);
  end if;

  insert into "consolidationRun" ("scenarioId", "notes") values (pScenarioId, 'fnConsolidar')
  returning "runId" into vRunId;

  insert into "consolidationRunLoad" ("runId", "loadId")
  select vRunId, d."loadId" from "dataLoad" d
    join "status" s on s."domainCode" = 'LOAD' and s."statusCode" = d."statusCode"
   where d."scenarioId" = pScenarioId and s."isConsolidable";

  create temp table if not exists "tmpRunLine" on commit drop as select * from "fnRunLineUsd"(vRunId) limit 0;
  truncate "tmpRunLine";
  insert into "tmpRunLine" select * from "fnRunLineUsd"(vRunId);

  select count(*) into vMissing from "tmpRunLine" where "groupAccountId" is not null and "rate" is null;
  if vMissing > 0 then
    raise exception using errcode = 'check_violation',
      message = format('%s mapped lines have no group exchange rate for scenario %s', vMissing, pScenarioId);
  end if;

  perform "fnConciliar"(vRunId);

  -- Eliminaciones: solo documentos con conciliación que permite eliminar (CONCILIADO / CONCILIADO_FX).
  insert into "elimination" ("runId", "eliminationCode", "eliminationRuleCode", "icDocumentId", "companyId", "groupAccountId", "effectUsd", "sourceRef")
  with rec as (
    select r."icDocumentId", r."financialStatementCode",
           split_part(r."lineRefs", ';', 1) as "aLine", split_part(r."lineRefs", ';', 2) as "bLine"
    from "icReconciliation" r
    join "status" s on s."domainCode" = 'RECONCILIATION' and s."statusCode" = r."statusCode"
    where r."runId" = vRunId and s."allowsElimination"
  ), legs as (
    select rec.*, a."companyId" as "aCompany", a."groupAccountId" as "aAccount", a."usd" as "aUsd",
           b."companyId" as "bCompany", b."groupAccountId" as "bAccount", b."usd" as "bUsd",
           case a."groupAccountId" when '4200' then 'E1' when '4300' then 'E1' when '1250' then 'E2'
                                   when '1600' then 'E3' when '7300' then 'E4' end as "ruleCode"
    from rec
    join "tmpRunLine" a on a."lineId" = rec."aLine"
    join "tmpRunLine" b on b."lineId" = rec."bLine"
  ), numbered as (
    select legs.*, 'EL-' || lpad((row_number() over (order by "icDocumentId", "financialStatementCode"))::text, 4, '0') as code
    from legs where "ruleCode" is not null
  )
  select vRunId, code, "ruleCode", "icDocumentId", "aCompany", "aAccount", -"aUsd", "aLine" from numbered
  union all
  select vRunId, code, "ruleCode", "icDocumentId", "bCompany", "bAccount", -"bUsd", "bLine" from numbered
  union all
  select vRunId, code, 'E7', "icDocumentId", null,
         case when "financialStatementCode" = 'PYG' then '7900' else '3900' end,
         "bUsd" - "aUsd", "aLine" || ';' || "bLine"
  from numbered where "bUsd" - "aUsd" <> 0
  order by 2, 3;

  -- Consolidado por cuenta: agregado (Σ líneas en centavos) + eliminaciones + CTA (3900).
  create temp table if not exists "tmpRunBalance" ("groupAccountId" text primary key, "accountTypeCode" text,
    "aggregatedUsd" numeric not null default 0, "eliminationsUsd" numeric not null default 0,
    "translationAdjustmentUsd" numeric not null default 0) on commit drop;
  truncate "tmpRunBalance";
  insert into "tmpRunBalance" ("groupAccountId", "accountTypeCode", "aggregatedUsd", "eliminationsUsd")
  select g."groupAccountId", g."accountTypeCode", coalesce(a.s, 0), coalesce(e.s, 0)
  from "groupAccount" g
  left join (select "groupAccountId", sum("usd") s from "tmpRunLine" where "groupAccountId" is not null group by 1) a using ("groupAccountId")
  left join (select "groupAccountId", sum("effectUsd") s from "elimination" where "runId" = vRunId group by 1) e using ("groupAccountId")
  where a.s is not null or e.s is not null or g."groupAccountId" = '3900';

  select coalesce(sum(case when "accountTypeCode" = 'ACT' then 1 when "accountTypeCode" in ('PAS', 'PAT') then -1 else 0 end
                      * ("aggregatedUsd" + "eliminationsUsd")), 0)
    into vPlug from "tmpRunBalance";
  update "tmpRunBalance" set "translationAdjustmentUsd" = vPlug where "groupAccountId" = '3900';

  insert into "consolidatedBalance" ("runId", "groupAccountId", "aggregatedUsd", "eliminationsUsd", "translationAdjustmentUsd")
  select vRunId, "groupAccountId", "aggregatedUsd", "eliminationsUsd", "translationAdjustmentUsd" from "tmpRunBalance";

  -- Linaje: cada línea de carga, cada asiento de eliminación y el plug CTA.
  insert into "lineage" ("runId", "groupAccountId", "sourceTypeCode", "sourceId", "companyId", "localAmount", "currencyCode", "rate", "contributionUsd")
  select vRunId, "groupAccountId", 'LINEA_CARGA', "lineId", "companyId", "amount", "currencyCode", "rate", "usd"
    from "tmpRunLine" where "groupAccountId" is not null
  union all
  select vRunId, "groupAccountId", 'ELIMINACION_' || "eliminationRuleCode", "eliminationCode" || ' (' || "icDocumentId" || ')',
         "companyId", null, 'USD', 1, "effectUsd"
    from "elimination" where "runId" = vRunId
  union all
  select vRunId, '3900', 'CTA_CONVERSION', 'plug balance consolidado', null, null, 'USD', 1, vPlug;

  -- lineageOk se fija una sola vez: Σ linaje por cuenta = consolidado (±0.01).
  select count(*) into vBad
    from "consolidatedBalance" c
    left join (select "groupAccountId", sum("contributionUsd") s from "lineage" where "runId" = vRunId group by 1) l using ("groupAccountId")
   where c."runId" = vRunId and abs(c."consolidatedUsd" - coalesce(l.s, 0)) > 0.01;
  update "consolidationRun" set "lineageOk" = (vBad = 0) where "runId" = vRunId;

  return vRunId;
end $$;
comment on function "fnConsolidar"(text) is 'QB-14: creates a NEW immutable run for the scenario (APROBADA loads only): reconciliation, eliminations E1-E4/E7, consolidated balance with CTA in 3900, lineage and lineageOk. Never touches previous runs.';

grant execute on function "fnRunLineUsd"(uuid) to authenticated;
grant execute on function "fnConciliar"(uuid) to authenticated;
grant execute on function "fnConsolidar"(text) to authenticated;
revoke execute on function "fnRunLineUsd"(uuid) from anon, public;
revoke execute on function "fnConciliar"(uuid) from anon, public;
revoke execute on function "fnConsolidar"(text) from anon, public;
