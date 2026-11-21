-- =====================================================================
-- 08_redondeo_al_final.sql — QA-H3 (tolerancia oficial vs oráculo: 0.01 USD)
-- Corre DESPUÉS de 07_motor_conciliar_consolidar.sql. NO reescribe el 07.
-- Solo reemplaza vLineUsd, fnRunLineUsd, fnConciliar y fnConsolidar, y amplía
-- lineage."contributionUsd" para poder guardar el aporte sin redondear.
-- NO se ha aplicado a la base en vivo: aplicarlo es decisión de Aroldo.
-- No toca datos de corridas existentes (las del seed 06 incluidas).
--
-- Redondeo (oráculo: referencia/motor_referencia.py, que NO redondea por línea):
--   * Se convierte y se SUMA en USD crudo (amount * rate, sin round por línea).
--   * Se redondea a centavos SOLO al final, por cuenta o total que se reporta:
--       consolidado (agregado, eliminaciones, CTA), filas de icReconciliation
--       (issuer/receiver/difference) y el asiento CTA (plug).
--   * Los ESTADOS de conciliación se siguen decidiendo con el USD sin redondear
--     (corte CONCILIADO |Δ| < 0.005 y tolerancias del snapshot), como el oráculo.
--   * E7 se genera cuando |Δ crudo| ≥ 0.005 (es decir, en CONCILIADO_FX).
--   * El linaje guarda el aporte crudo; lineageOk comprueba Σ linaje = consolidado
--     redondeado (±0.01). El plug CTA se calcula con los totales ya redondeados
--     por cuenta, para que el balance cuadre en centavos.
-- =====================================================================

-- Aportes de linaje en precisión completa (las cuentas reportadas siguen en numeric(20,2)).
-- Hay que recrear las vistas que dependen de contributionUsd; los valores ya guardados
-- (p. ej. corridas del 06) no se reescriben.
drop view if exists "vVarianceBridgeCheck";
drop view if exists "vGroupKpi";
drop view if exists "vCompanyKpi";
drop view if exists "vKpi";
drop view if exists "vKpiBalance";
drop view if exists "vLineageDetail";
alter table "lineage" alter column "contributionUsd" type numeric(20,10);

create view "vKpiBalance" with (security_invoker = true) as
select cb."runId", 'CONSOLIDADO'::text as "basisCode", null::text as "companyId", cb."groupAccountId", cb."consolidatedUsd" as "amountUsd"
  from "consolidatedBalance" cb
union all
select cb."runId", 'AGREGADO', null, cb."groupAccountId", cb."aggregatedUsd"
  from "consolidatedBalance" cb
union all
select l."runId", 'EMPRESA', l."companyId", l."groupAccountId", sum(l."contributionUsd")
  from "lineage" l
 where l."sourceTypeCode" = 'LINEA_CARGA' and l."companyId" is not null
 group by l."runId", l."companyId", l."groupAccountId";
comment on view "vKpiBalance" is 'Balance per run × basis (CONSOLIDADO, AGREGADO, EMPRESA) × company × group account: the only input of the KPIs.';

create view "vKpi" with (security_invoker = true) as
with m as (
  select b.*, t."kpiSign", t."accountTypeCode", ac."kpiGroupCode", ac."isSales", g."isCurrent"
    from "vKpiBalance" b
    join "groupAccount" g     on g."groupAccountId" = b."groupAccountId"
    join "accountType" t      on t."accountTypeCode" = g."accountTypeCode"
    join "accountCategory" ac on ac."accountCategoryCode" = g."accountCategoryCode"
), k as (
  select "runId", "basisCode", "companyId",
         coalesce(sum("amountUsd") filter (where "isSales"), 0)                                   as "salesUsd",
         coalesce(sum("amountUsd" * "kpiSign") filter (where "kpiGroupCode" = 'EBIT'), 0)            as "ebitUsd",
         coalesce(sum("amountUsd" * "kpiSign") filter (where "kpiGroupCode" = 'WORKING_CAPITAL'), 0) as "workingCapitalUsd",
         coalesce(sum("amountUsd" * "kpiSign") filter (where "kpiGroupCode" = 'FIXED_ASSET'), 0)     as "fixedAssetsUsd",
         coalesce(sum("amountUsd") filter (where "accountTypeCode" = 'ACT'), 0)                       as "totalAssetsUsd",
         coalesce(sum("amountUsd") filter (where "accountTypeCode" = 'PAS' and "isCurrent"), 0)       as "currentLiabilitiesUsd"
    from m
   group by "runId", "basisCode", "companyId"
), groupTax as (   -- effective group rate: statutory rates weighted by POSITIVE stand-alone EBIT of each company
  select k."runId",
         sum(k."ebitUsd" * c."incomeTaxRate") / nullif(sum(k."ebitUsd"), 0) as "taxRate"
    from k join "company" c on c."companyId" = k."companyId"
   where k."basisCode" = 'EMPRESA' and k."ebitUsd" > 0
   group by k."runId"
), r as (
  select k.*,
         coalesce(c."incomeTaxRate", gt."taxRate")                      as "effectiveTaxRate",
         (run."parameterSnapshot" ->> 'WACC')::numeric                  as "wacc",
         k."workingCapitalUsd" + k."fixedAssetsUsd"                     as "investedCapitalUsd",
         k."totalAssetsUsd" - k."currentLiabilitiesUsd"                 as "capitalEmployedUsd"
    from k
    join "consolidationRun" run on run."runId" = k."runId"
    left join "company" c   on c."companyId" = k."companyId"
    left join groupTax gt   on gt."runId" = k."runId"
)
select r.*,
       r."ebitUsd" * (1 - r."effectiveTaxRate")                                          as "nopatUsd",
       r."ebitUsd" * (1 - r."effectiveTaxRate") / nullif(r."investedCapitalUsd", 0)      as "roic",
       r."ebitUsd" / nullif(r."capitalEmployedUsd", 0)                                   as "roce",
       r."ebitUsd" * (1 - r."effectiveTaxRate") - r."wacc" * r."investedCapitalUsd"      as "evaUsd"
  from r;
comment on view "vKpi" is 'All KPIs per run and basis: sales, EBIT, effective tax, NOPAT, invested capital, capital employed, ROIC, ROCE, WACC (run snapshot), EVA.';

create view "vGroupKpi" with (security_invoker = true) as
select * from "vKpi" where "basisCode" in ('CONSOLIDADO', 'AGREGADO');
comment on view "vGroupKpi" is 'Group KPIs per run: CONSOLIDADO (official) and AGREGADO (without eliminations, shows the double count) (legacy: v_kpi_grupo).';

create view "vCompanyKpi" with (security_invoker = true) as
select * from "vKpi" where "basisCode" = 'EMPRESA';
comment on view "vCompanyKpi" is 'Stand-alone KPIs per company and run, with the company statutory tax rate.';

-- Drill-down: from a consolidated figure to the file row that produced it.
create view "vLineageDetail" with (security_invoker = true) as
select l."runId", r."scenarioId", l."groupAccountId", g."name" as "groupAccountName",
       l."sourceTypeCode", l."sourceId", l."companyId", c."name" as "companyName",
       l."localAmount", l."currencyCode", l."rate", l."contributionUsd",
       dl."periodCode", dl."localAccountCode", dl."description", dl."icPartnerCode", dl."icDocumentId",
       d."loadId", d."fileName", d."version" as "loadVersion", d."statusCode" as "loadStatusCode",
       d."uploadedBy", d."uploadedAt", d."approvedBy", d."approvedAt"
  from "lineage" l
  join "consolidationRun" r  on r."runId" = l."runId"
  join "groupAccount" g      on g."groupAccountId" = l."groupAccountId"
  left join "company" c      on c."companyId" = l."companyId"
  left join "dataLoadLine" dl on l."sourceTypeCode" = 'LINEA_CARGA' and dl."lineId" = l."sourceId"
  left join "dataLoad" d     on d."loadId" = dl."loadId";
comment on view "vLineageDetail" is 'Each contribution to a consolidated figure with its source row, file, uploader and approver (director drill-down).';

-- Variance explainer check: the bridge must add up to the KPI deltas between the two runs (±1 USD).
create view "vVarianceBridgeCheck" with (security_invoker = true) as
with l as (
  select "bridgeId", sum("salesDeltaUsd") as "sales", sum("ebitDeltaUsd") as "ebit"
    from "varianceBridgeLine" group by "bridgeId"
), e as (
  select "bridgeId", sum("evaDeltaUsd") as "eva" from "varianceBridgeEva" group by "bridgeId"
)
select b."bridgeId", b."fromRunId", b."toRunId",
       coalesce(l."sales", 0)              as "bridgeSalesDeltaUsd", k2."salesUsd" - k1."salesUsd" as "kpiSalesDeltaUsd",
       coalesce(l."ebit", 0)               as "bridgeEbitDeltaUsd",  k2."ebitUsd" - k1."ebitUsd"   as "kpiEbitDeltaUsd",
       coalesce(e."eva", 0)                as "bridgeEvaDeltaUsd",   k2."evaUsd" - k1."evaUsd"     as "kpiEvaDeltaUsd",
       abs(coalesce(l."sales", 0) - (k2."salesUsd" - k1."salesUsd")) <= 1
   and abs(coalesce(l."ebit", 0)  - (k2."ebitUsd"  - k1."ebitUsd"))  <= 1
   and abs(coalesce(e."eva", 0)   - (k2."evaUsd"   - k1."evaUsd"))   <= 1 as "isBalanced"
  from "varianceBridge" b
  left join l on l."bridgeId" = b."bridgeId"
  left join e on e."bridgeId" = b."bridgeId"
  join "vKpi" k1 on k1."runId" = b."fromRunId" and k1."basisCode" = 'CONSOLIDADO'
  join "vKpi" k2 on k2."runId" = b."toRunId"   and k2."basisCode" = 'CONSOLIDADO';
comment on view "vVarianceBridgeCheck" is 'Σ bridge effects vs Δ consolidated sales, EBIT and EVA between the two runs; isBalanced within ±1 USD.';

grant all on "vKpiBalance", "vKpi", "vGroupKpi", "vCompanyKpi", "vLineageDetail", "vVarianceBridgeCheck"
  to authenticated, service_role;

-- Vista de línea: amountUsd queda crudo. vAggregate / vIcBilledMatrix / vIcBalanceMatrix
-- ya hacen round(sum(...), 2), así el redondeo queda en el total reportado, no por línea.
create or replace view "vLineUsd" with (security_invoker = true) as
select v.*, r."rateTypeCode", r."rateToUsd" as "rate", (v."amount" * r."rateToUsd") as "amountUsd"
from "vMappedLine" v
left join "groupExchangeRate" r
  on r."scenarioId" = v."scenarioId" and r."periodCode" = v."periodCode"
 and r."currencyCode" = v."functionalCurrencyCode" and r."rateTypeCode" = v."requiredRateTypeCode";
comment on view "vLineUsd" is 'Line translated to USD with the group rate (legacy: v_linea_usd). amountUsd is unrounded; aggregates round the sum once.';

create or replace function "fnRunLineUsd"(pRunId uuid)
returns table (
  "lineId" text, "loadId" uuid, "fileName" text, "rowNumber" int, "companyId" text,
  "groupAccountId" text, "accountTypeCode" text, "isIntercompany" boolean,
  "financialStatementCode" text, "periodCode" text, "icDocumentId" text, "icPartnerCode" text,
  "transactionAmount" numeric, "amount" numeric, "currencyCode" text, "rate" numeric,
  "usdRaw" numeric, "usd" numeric)
language sql stable set search_path = public, pg_temp as $$
  -- Misma lógica que vMappedLine + vLineUsd, partiendo de las cargas de la corrida.
  -- usd / usdRaw son el USD crudo (sin redondear por línea).
  select l."lineId", l."loadId", d."fileName", l."rowNumber", d."companyId",
         m."groupAccountId", g."accountTypeCode", coalesce(g."isIntercompany", false),
         d."financialStatementCode", l."periodCode", nullif(btrim(l."icDocumentId"), ''), l."icPartnerCode",
         l."transactionAmount", l."amount", c."functionalCurrencyCode", r."rateToUsd",
         l."amount" * r."rateToUsd", l."amount" * r."rateToUsd"
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
comment on function "fnRunLineUsd"(uuid) is 'Lines of the loads attached to a run, translated to USD without per-line rounding (usd = usdRaw). Helper of fnConciliar / fnConsolidar.';

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

  -- Montos guardados: redondeo al final por pata reportada. El estado usa el USD crudo.
  insert into "icReconciliation" ("runId", "icDocumentId", "financialStatementCode", "issuerCompanyId", "receiverCompanyId",
                                  "statusCode", "issuerUsd", "receiverUsd", "differenceUsd", "lineRefs")
  with ic as (
    select l.*, (l."accountTypeCode" in ('ING', 'ACT')) as "isIssuerLeg",
           (l."accountTypeCode" in ('GAS', 'PAS')) as "isReceiverLeg"
    from "tmpIcLine" l
  ), g as (
    select "icDocumentId", "financialStatementCode",
           count(*) filter (where "isIssuerLeg") as na, count(*) filter (where "isReceiverLeg") as nb,
           sum("usdRaw") filter (where "isIssuerLeg") as "sumA", sum("usdRaw") filter (where "isReceiverLeg") as "sumB",
           string_agg("lineId", ';' order by "fileName", "rowNumber") as refs,
           (array_agg("companyId" order by "fileName", "rowNumber"))[1] as "firstCompany",
           (array_agg("icPartnerCode" order by "fileName", "rowNumber"))[1] as "firstPartner"
    from ic group by 1, 2
  ), paired as (
    select g.*, a."companyId" as "aCompany", b."companyId" as "bCompany",
           a."usdRaw" as "aRaw", b."usdRaw" as "bRaw",
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
         round(case when na = 1 and nb = 1 then "aRaw" else coalesce("sumA", 0) end, 2),
         round(case when na = 1 and nb = 1 then "bRaw" else coalesce("sumB", 0) end, 2),
         round(case when na = 1 and nb = 1 then "aRaw" else coalesce("sumA", 0) end, 2)
           - round(case when na = 1 and nb = 1 then "bRaw" else coalesce("sumB", 0) end, 2),
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
comment on function "fnConciliar"(uuid) is 'QB-13: IC reconciliation of a run with frozen FX tolerances. Status uses unrounded USD; stored amounts are rounded once per reported leg.';

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

  -- Efectos crudos (el asiento guardado en elimination se redondea al insertar, numeric(20,2)).
  create temp table if not exists "tmpElimRaw" (
    "eliminationCode" text, "eliminationRuleCode" text, "icDocumentId" text,
    "companyId" text, "groupAccountId" text, "effectUsd" numeric, "sourceRef" text
  ) on commit drop;
  truncate "tmpElimRaw";

  insert into "tmpElimRaw"
  with rec as (
    select r."icDocumentId", r."financialStatementCode",
           split_part(r."lineRefs", ';', 1) as "aLine", split_part(r."lineRefs", ';', 2) as "bLine"
    from "icReconciliation" r
    join "status" s on s."domainCode" = 'RECONCILIATION' and s."statusCode" = r."statusCode"
    where r."runId" = vRunId and s."allowsElimination"
  ), legs as (
    select rec.*, a."companyId" as "aCompany", a."groupAccountId" as "aAccount", a."usdRaw" as "aUsd",
           b."companyId" as "bCompany", b."groupAccountId" as "bAccount", b."usdRaw" as "bUsd",
           case a."groupAccountId" when '4200' then 'E1' when '4300' then 'E1' when '1250' then 'E2'
                                   when '1600' then 'E3' when '7300' then 'E4' end as "ruleCode"
    from rec
    join "tmpRunLine" a on a."lineId" = rec."aLine"
    join "tmpRunLine" b on b."lineId" = rec."bLine"
  ), numbered as (
    select legs.*, 'EL-' || lpad((row_number() over (order by "icDocumentId", "financialStatementCode"))::text, 4, '0') as code
    from legs where "ruleCode" is not null
  )
  select code, "ruleCode", "icDocumentId", "aCompany", "aAccount", -"aUsd", "aLine" from numbered
  union all
  select code, "ruleCode", "icDocumentId", "bCompany", "bAccount", -"bUsd", "bLine" from numbered
  union all
  select code, 'E7', "icDocumentId", null,
         case when "financialStatementCode" = 'PYG' then '7900' else '3900' end,
         "bUsd" - "aUsd", "aLine" || ';' || "bLine"
  from numbered where abs("bUsd" - "aUsd") >= 0.005
  order by 1, 2;

  insert into "elimination" ("runId", "eliminationCode", "eliminationRuleCode", "icDocumentId", "companyId", "groupAccountId", "effectUsd", "sourceRef")
  select vRunId, "eliminationCode", "eliminationRuleCode", "icDocumentId", "companyId", "groupAccountId", "effectUsd", "sourceRef"
  from "tmpElimRaw"
  order by "eliminationCode", "eliminationRuleCode";

  -- Totales crudos por cuenta; el redondeo a centavos es por cuenta (total reportado).
  create temp table if not exists "tmpRunBalance" ("groupAccountId" text primary key, "accountTypeCode" text,
    "aggregatedUsd" numeric not null default 0, "eliminationsUsd" numeric not null default 0,
    "translationAdjustmentUsd" numeric not null default 0) on commit drop;
  truncate "tmpRunBalance";
  insert into "tmpRunBalance" ("groupAccountId", "accountTypeCode", "aggregatedUsd", "eliminationsUsd")
  select g."groupAccountId", g."accountTypeCode", coalesce(a.s, 0), coalesce(e.s, 0)
  from "groupAccount" g
  left join (select "groupAccountId", sum("usdRaw") s from "tmpRunLine" where "groupAccountId" is not null group by 1) a using ("groupAccountId")
  left join (select "groupAccountId", sum("effectUsd") s from "tmpElimRaw" group by 1) e using ("groupAccountId")
  where a.s is not null or e.s is not null or g."groupAccountId" = '3900';

  update "tmpRunBalance" set "aggregatedUsd" = round("aggregatedUsd", 2), "eliminationsUsd" = round("eliminationsUsd", 2);

  select coalesce(sum(case when "accountTypeCode" = 'ACT' then 1 when "accountTypeCode" in ('PAS', 'PAT') then -1 else 0 end
                      * ("aggregatedUsd" + "eliminationsUsd")), 0)
    into vPlug from "tmpRunBalance";
  update "tmpRunBalance" set "translationAdjustmentUsd" = vPlug where "groupAccountId" = '3900';

  insert into "consolidatedBalance" ("runId", "groupAccountId", "aggregatedUsd", "eliminationsUsd", "translationAdjustmentUsd")
  select vRunId, "groupAccountId", "aggregatedUsd", "eliminationsUsd", "translationAdjustmentUsd" from "tmpRunBalance";

  -- Linaje en crudo (líneas y eliminaciones); el plug CTA es el total ya redondeado.
  insert into "lineage" ("runId", "groupAccountId", "sourceTypeCode", "sourceId", "companyId", "localAmount", "currencyCode", "rate", "contributionUsd")
  select vRunId, "groupAccountId", 'LINEA_CARGA', "lineId", "companyId", "amount", "currencyCode", "rate", "usdRaw"
    from "tmpRunLine" where "groupAccountId" is not null
  union all
  select vRunId, "groupAccountId", 'ELIMINACION_' || "eliminationRuleCode", "eliminationCode" || ' (' || "icDocumentId" || ')',
         "companyId", null, 'USD', 1, "effectUsd"
    from "tmpElimRaw"
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
comment on function "fnConsolidar"(text) is 'QB-14: new immutable run. Sums unrounded USD and rounds once per reported account total (QA-H3). Eliminations E1-E4/E7, CTA in 3900, lineage and lineageOk. Never touches previous runs.';

grant execute on function "fnRunLineUsd"(uuid) to authenticated;
grant execute on function "fnConciliar"(uuid) to authenticated;
grant execute on function "fnConsolidar"(text) to authenticated;
revoke execute on function "fnRunLineUsd"(uuid) from anon, public;
revoke execute on function "fnConciliar"(uuid) from anon, public;
revoke execute on function "fnConsolidar"(text) from anon, public;
