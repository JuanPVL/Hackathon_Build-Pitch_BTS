-- =====================================================================
-- 10_load_validation_and_workflow.sql — P0-3 / P0-4 / P0-5
-- Corre DESPUÉS de 01..05 (y convive con 06..09). NO se ha aplicado a la
-- base en vivo. Es idempotente: se puede aplicar dos veces sin errores.
--
-- Incluye:
--   1. Estado VALIDADA en el dominio LOAD y sus transiciones válidas:
--        RECIBIDA -> VALIDADA -> APROBADA / CUARENTENA / REEMPLAZADA
--        CUARENTENA -> VALIDADA / CUARENTENA
--        PENDIENTE_APROBACION -> VALIDADA
--   2. Función "fnValidarCarga"(pLoadId uuid) (SECURITY INVOKER, RLS activo):
--      ejecuta las reglas de validación sobre la carga en versión vigente,
--      reemplaza sus hallazgos activos en "validationFinding" y actualiza
--      "dataLoad"."statusCode" a VALIDADA (0 errores) o CUARENTENA (con hallazgos).
-- =====================================================================
begin;

-- 1. Catálogo de estado VALIDADA y transiciones (idempotente)
insert into "status" (
  "domainCode", "statusCode", "name", "sortOrder",
  "isInitial", "isFinal", "isConsolidable", "allowsElimination", "blocksScenarioClose"
) values (
  'LOAD', 'VALIDADA', 'Validated', 3,
  false, false, false, false, false
)
on conflict ("domainCode", "statusCode") do update
   set "name" = excluded."name",
       "sortOrder" = excluded."sortOrder",
       "isInitial" = excluded."isInitial",
       "isFinal" = excluded."isFinal",
       "isConsolidable" = excluded."isConsolidable",
       "allowsElimination" = excluded."allowsElimination",
       "blocksScenarioClose" = excluded."blocksScenarioClose";

insert into "statusTransition" ("domainCode", "fromStatusCode", "toStatusCode", "requiresReason", "isActive") values
  ('LOAD', 'RECIBIDA',             'VALIDADA',   false, true),
  ('LOAD', 'CUARENTENA',           'VALIDADA',   false, true),
  ('LOAD', 'PENDIENTE_APROBACION', 'VALIDADA',   false, true),
  ('LOAD', 'VALIDADA',             'APROBADA',   false, true),
  ('LOAD', 'VALIDADA',             'CUARENTENA', false, true),
  ('LOAD', 'VALIDADA',             'REEMPLAZADA', false, true)
on conflict ("domainCode", "fromStatusCode", "toStatusCode") do update
   set "requiresReason" = excluded."requiresReason",
       "isActive"       = excluded."isActive";

-- 2. Motor de validación de una carga (SECURITY INVOKER: respeta RLS y authz.canWriteCompany)
create or replace function "fnValidarCarga"(pLoadId uuid) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  vLoad "dataLoad"%rowtype;
  vCompany "company"%rowtype;
  vRate numeric;
  vScaleThreshold numeric;
  vNextStatus text;
  vBlocking int;
  vWarnings int;
  vInfo int;
  vTotal int;
begin
  select * into vLoad from "dataLoad" where "loadId" = pLoadId for update;
  if not found then
    raise exception using errcode = 'no_data_found',
      message = format('Load %s not found', pLoadId);
  end if;

  if not authz."canWriteCompany"(vLoad."companyId") then
    raise exception using errcode = 'insufficient_privilege',
      message = format('No write permission on company %s', vLoad."companyId");
  end if;

  if vLoad."statusCode" in ('APROBADA', 'REEMPLAZADA') then
    raise exception using errcode = 'check_violation',
      message = format('LOAD: load %s in status %s cannot be re-validated', pLoadId, vLoad."statusCode");
  end if;

  select * into vCompany from "company" where "companyId" = vLoad."companyId";

  -- Tasa mediana PRESUPUESTO de la moneda funcional para estimar impacto en USD (igual que el oráculo)
  select coalesce((percentile_cont(0.5) within group (order by r."rateToUsd"))::numeric, 1.0::numeric)
    into vRate
    from "groupExchangeRate" r
   where r."scenarioId" = vLoad."scenarioId"
     and r."currencyCode" = vCompany."functionalCurrencyCode"
     and r."rateTypeCode" = 'PRESUPUESTO'
     and r."isActive";
  vRate := coalesce(vRate, 1.0);

  select coalesce((select p."value" from "parameter" p
                    where p."scenarioId" = vLoad."scenarioId"
                      and p."parameterCode" = 'UMBRAL_ESCALA'
                      and p."isActive"), 10)
    into vScaleThreshold;

  -- Limpiar hallazgos previos de esta carga para que revalidar sea idempotente
  delete from "validationFinding" where "loadId" = pLoadId;

  -- V01: estructura / campos obligatorios / formato de periodo YYYY-MM / empresa y escenario coherentes
  insert into "validationFinding" (
    "loadId", "scenarioId", "ruleCode", "severityCode", "companyCode",
    "recordRef", "message", "foundValue", "expectedValue", "impactUsd"
  )
  select
    pLoadId,
    vLoad."scenarioId",
    'V01',
    'B',
    coalesce(nullif(btrim(l."companyCode"), ''), vLoad."companyId"),
    l."lineId",
    case
      when coalesce(btrim(l."periodCode"), '') !~ '^\d{4}-(0[1-9]|1[0-2])$'
        then 'Periodo con formato inválido'
      when coalesce(btrim(l."companyCode"), '') <> vLoad."companyId"
        then format('Empresa en línea (%s) ≠ empresa de la carga (%s)', coalesce(l."companyCode", ''), vLoad."companyId")
      when coalesce(btrim(l."scenarioCode"), '') <> vLoad."scenarioId"
        then format('Escenario en línea (%s) ≠ escenario de la carga (%s)', coalesce(l."scenarioCode", ''), vLoad."scenarioId")
      else 'Línea sin cuenta_local, moneda o monto válido'
    end,
    case
      when coalesce(btrim(l."periodCode"), '') !~ '^\d{4}-(0[1-9]|1[0-2])$' then coalesce(l."periodCode", '')
      when coalesce(btrim(l."companyCode"), '') <> vLoad."companyId" then coalesce(l."companyCode", '')
      when coalesce(btrim(l."scenarioCode"), '') <> vLoad."scenarioId" then coalesce(l."scenarioCode", '')
      else coalesce(l."localAccountCode", '')
    end,
    case
      when coalesce(btrim(l."periodCode"), '') !~ '^\d{4}-(0[1-9]|1[0-2])$' then 'AAAA-MM'
      when coalesce(btrim(l."companyCode"), '') <> vLoad."companyId" then vLoad."companyId"
      when coalesce(btrim(l."scenarioCode"), '') <> vLoad."scenarioId" then vLoad."scenarioId"
      else 'cuenta_local, moneda y monto obligatorios'
    end,
    round(abs(coalesce(l."amount", 0) * vRate), 2)
  from "dataLoadLine" l
  where l."loadId" = pLoadId
    and (
      coalesce(btrim(l."periodCode"), '') !~ '^\d{4}-(0[1-9]|1[0-2])$'
      or coalesce(btrim(l."companyCode"), '') <> vLoad."companyId"
      or coalesce(btrim(l."scenarioCode"), '') <> vLoad."scenarioId"
      or coalesce(btrim(l."localAccountCode"), '') = ''
      or coalesce(btrim(l."currencyCode"), '') = ''
      or l."amount" is null
    );

  -- V02: moneda declarada ≠ moneda funcional de la empresa
  insert into "validationFinding" (
    "loadId", "scenarioId", "ruleCode", "severityCode", "companyCode",
    "recordRef", "message", "foundValue", "expectedValue", "impactUsd"
  )
  select
    pLoadId,
    vLoad."scenarioId",
    'V02',
    'B',
    vLoad."companyId",
    l."lineId",
    format('Moneda declarada %s ≠ moneda funcional %s', l."currencyCode", vCompany."functionalCurrencyCode"),
    l."currencyCode",
    vCompany."functionalCurrencyCode",
    round(abs(coalesce(l."amount", 0) * (
      coalesce((
        select (percentile_cont(0.5) within group (order by r2."rateToUsd"))::numeric
          from "groupExchangeRate" r2
         where r2."scenarioId" = vLoad."scenarioId"
           and r2."currencyCode" = l."currencyCode"
           and r2."rateTypeCode" = 'PRESUPUESTO'
           and r2."isActive"
      ), 1.0::numeric) - vRate
    )), 2)
  from "dataLoadLine" l
  where l."loadId" = pLoadId
    and coalesce(btrim(l."currencyCode"), '') <> ''
    and l."currencyCode" <> vCompany."functionalCurrencyCode";

  -- V03: cuenta local sin mapeo a cuenta de grupo
  insert into "validationFinding" (
    "loadId", "scenarioId", "ruleCode", "severityCode", "companyCode",
    "recordRef", "message", "foundValue", "expectedValue", "impactUsd"
  )
  select
    pLoadId,
    vLoad."scenarioId",
    'V03',
    'B',
    vLoad."companyId",
    l."lineId",
    format('Cuenta local ''%s'' sin mapeo a cuenta de grupo', l."localAccountCode"),
    l."localAccountCode",
    'cuenta mapeada',
    round(abs(coalesce(l."amount", 0) * vRate), 2)
  from "dataLoadLine" l
  left join "accountMapping" m
    on m."countryCode" = vCompany."countryCode"
   and m."localAccountCode" = l."localAccountCode"
   and m."isActive"
  where l."loadId" = pLoadId
    and coalesce(btrim(l."localAccountCode"), '') <> ''
    and m."groupAccountId" is null;

  -- V04: líneas duplicadas dentro del archivo
  insert into "validationFinding" (
    "loadId", "scenarioId", "ruleCode", "severityCode", "companyCode",
    "recordRef", "message", "foundValue", "expectedValue", "impactUsd"
  )
  select
    pLoadId,
    vLoad."scenarioId",
    'V04',
    'B',
    vLoad."companyId",
    d."lineId",
    format('Línea duplicada (%s %s)', d."localAccountCode", d."periodCode"),
    null,
    null,
    round(abs(coalesce(d."amount", 0) * vRate), 2)
  from (
    select l.*,
           row_number() over (
             partition by l."companyCode", l."periodCode", l."localAccountCode",
                          coalesce(l."icPartnerCode", ''), coalesce(l."icDocumentId", ''),
                          coalesce(l."counterpartyTaxId", '')
             order by l."rowNumber"
           ) as rn
      from "dataLoadLine" l
     where l."loadId" = pLoadId
  ) d
  where d.rn > 1;

  -- V05: todos los periodos del escenario presentes (12 meses en PYG)
  if vLoad."financialStatementCode" = 'PYG' then
    insert into "validationFinding" (
      "loadId", "scenarioId", "ruleCode", "severityCode", "companyCode",
      "recordRef", "message", "foundValue", "expectedValue", "impactUsd"
    )
    with expected_periods as (
      select distinct r."periodCode"
        from "groupExchangeRate" r
       where r."scenarioId" = vLoad."scenarioId"
         and r."rateTypeCode" = 'PRESUPUESTO'
         and r."isActive"
    ),
    present_periods as (
      select distinct l."periodCode"
        from "dataLoadLine" l
       where l."loadId" = pLoadId
    ),
    sales_by_period as (
      select l."periodCode", sum(coalesce(l."amount", 0) * vRate) as usd_est
        from "dataLoadLine" l
        join "accountMapping" m
          on m."countryCode" = vCompany."countryCode"
         and m."localAccountCode" = l."localAccountCode"
         and m."isActive"
       where l."loadId" = pLoadId
         and m."groupAccountId" = '4100'
       group by l."periodCode"
    ),
    sales_median as (
      select coalesce((percentile_cont(0.5) within group (order by s.usd_est))::numeric, 0::numeric) as med
        from sales_by_period s
    )
    select
      pLoadId,
      vLoad."scenarioId",
      'V05',
      'B',
      vLoad."companyId",
      'presupuesto_' || vLoad."companyId",
      format('Periodo %s sin ninguna línea', ep."periodCode"),
      'falta ' || ep."periodCode",
      '12 periodos',
      round(abs((select med from sales_median)), 2)
    from expected_periods ep
    left join present_periods pp on pp."periodCode" = ep."periodCode"
    where pp."periodCode" is null
    order by ep."periodCode";
  end if;

  -- V06: balance cuadra (Activo = Pasivo + Patrimonio por periodo)
  if vLoad."financialStatementCode" = 'BALANCE' then
    insert into "validationFinding" (
      "loadId", "scenarioId", "ruleCode", "severityCode", "companyCode",
      "recordRef", "message", "foundValue", "expectedValue", "impactUsd"
    )
    select
      pLoadId,
      vLoad."scenarioId",
      'V06',
      'B',
      vLoad."companyId",
      format('balance_%s %s', vLoad."companyId", b."periodCode"),
      format('Activo %s ≠ Pasivo+Patrimonio %s', to_char(b.act, 'FM999,999,999,990.00'), to_char(b.pp, 'FM999,999,999,990.00')),
      to_char(b.act, 'FM999,999,999,990.00'),
      to_char(b.pp, 'FM999,999,999,990.00'),
      round(abs((b.act - b.pp) * vRate), 2)
    from (
      select l."periodCode",
             coalesce(sum(l."amount") filter (where g."accountTypeCode" = 'ACT'), 0) as act,
             coalesce(sum(l."amount") filter (where g."accountTypeCode" in ('PAS', 'PAT')), 0) as pp
        from "dataLoadLine" l
        join "accountMapping" m
          on m."countryCode" = vCompany."countryCode"
         and m."localAccountCode" = l."localAccountCode"
         and m."isActive"
        join "groupAccount" g
          on g."groupAccountId" = m."groupAccountId"
       where l."loadId" = pLoadId
       group by l."periodCode"
    ) b
    where abs(b.act - b.pp) > 1;
  end if;

  -- V07: signo según convención (montos positivos)
  insert into "validationFinding" (
    "loadId", "scenarioId", "ruleCode", "severityCode", "companyCode",
    "recordRef", "message", "foundValue", "expectedValue", "impactUsd"
  )
  select
    pLoadId,
    vLoad."scenarioId",
    'V07',
    'B',
    vLoad."companyId",
    l."lineId",
    format('Monto negativo en %s (%s)', l."localAccountCode", coalesce(l."description", '')),
    to_char(l."amount", 'FM999,999,999,990.00'),
    '> 0',
    round(abs(2 * l."amount" * vRate), 2)
  from "dataLoadLine" l
  where l."loadId" = pLoadId
    and l."amount" < 0;

  -- V09: escala en PYG (valor > UMBRAL_ESCALA veces la mediana de la cuenta en la carga)
  if vLoad."financialStatementCode" = 'PYG' then
    insert into "validationFinding" (
      "loadId", "scenarioId", "ruleCode", "severityCode", "companyCode",
      "recordRef", "message", "foundValue", "expectedValue", "impactUsd"
    )
    with medians as (
      select l."localAccountCode",
             count(*) as n,
             (percentile_cont(0.5) within group (order by abs(l."amount")))::numeric as med
        from "dataLoadLine" l
       where l."loadId" = pLoadId
         and l."amount" is not null
       group by l."localAccountCode"
      having count(*) >= 3
    )
    select
      pLoadId,
      vLoad."scenarioId",
      'V09',
      case when (abs(l."amount") / m.med) > 100 then 'B' else 'A' end,
      vLoad."companyId",
      l."lineId",
      format('%s %s es %sx la mediana de la cuenta (¿miles vs unidades?)',
             l."localAccountCode", l."periodCode", to_char(round(abs(l."amount") / m.med), 'FM999,999,990')),
      to_char(l."amount", 'FM999,999,999,990.00'),
      '≈' || to_char(m.med, 'FM999,999,999,990.00'),
      round(abs((abs(l."amount") - m.med) * vRate), 2)
    from "dataLoadLine" l
    join medians m on m."localAccountCode" = l."localAccountCode"
    where l."loadId" = pLoadId
      and m.med > 0
      and (abs(l."amount") / m.med) > vScaleThreshold;
  end if;

  -- V10: línea en cuenta IC sin socio_ic
  insert into "validationFinding" (
    "loadId", "scenarioId", "ruleCode", "severityCode", "companyCode",
    "recordRef", "message", "foundValue", "expectedValue", "impactUsd"
  )
  select
    pLoadId,
    vLoad."scenarioId",
    'V10',
    'B',
    vLoad."companyId",
    l."lineId",
    format('Cuenta IC %s sin socio_ic (doc %s)', l."localAccountCode", coalesce(nullif(btrim(l."icDocumentId"), ''), '—')),
    null,
    null,
    round(abs(coalesce(l."amount", 0) * vRate), 2)
  from "dataLoadLine" l
  join "accountMapping" m
    on m."countryCode" = vCompany."countryCode"
   and m."localAccountCode" = l."localAccountCode"
   and m."isActive"
  join "groupAccount" g
    on g."groupAccountId" = m."groupAccountId"
  where l."loadId" = pLoadId
    and g."isIntercompany"
    and coalesce(btrim(l."icPartnerCode"), '') = '';

  -- V11: autofacturación (socio_ic = la misma empresa)
  insert into "validationFinding" (
    "loadId", "scenarioId", "ruleCode", "severityCode", "companyCode",
    "recordRef", "message", "foundValue", "expectedValue", "impactUsd"
  )
  select
    pLoadId,
    vLoad."scenarioId",
    'V11',
    'B',
    vLoad."companyId",
    l."lineId",
    format('Autofacturación: socio_ic = %s', l."icPartnerCode"),
    null,
    null,
    round(abs(coalesce(l."amount", 0) * vRate), 2)
  from "dataLoadLine" l
  where l."loadId" = pLoadId
    and coalesce(btrim(l."icPartnerCode"), '') <> ''
    and l."icPartnerCode" = l."companyCode";

  -- V13: transacción con tercero cuyo id fiscal pertenece a una empresa del grupo
  insert into "validationFinding" (
    "loadId", "scenarioId", "ruleCode", "severityCode", "companyCode",
    "recordRef", "message", "foundValue", "expectedValue", "impactUsd"
  )
  select
    pLoadId,
    vLoad."scenarioId",
    'V13',
    'B',
    vLoad."companyId",
    l."lineId",
    format('Registrado en cuenta de terceros (%s) pero la contraparte %s es %s (grupo)',
           l."localAccountCode", l."counterpartyTaxId", c."companyId"),
    'cuenta terceros',
    'cuenta IC + socio_ic',
    round(abs(coalesce(l."amount", 0) * vRate), 2)
  from "dataLoadLine" l
  join "accountMapping" m
    on m."countryCode" = vCompany."countryCode"
   and m."localAccountCode" = l."localAccountCode"
   and m."isActive"
  join "groupAccount" g
    on g."groupAccountId" = m."groupAccountId"
  join "company" c
    on c."taxId" = l."counterpartyTaxId"
  where l."loadId" = pLoadId
    and not g."isIntercompany"
    and coalesce(btrim(l."counterpartyTaxId"), '') <> '';

  -- Conteo de hallazgos de la carga
  select
    count(*) filter (where "severityCode" = 'B'),
    count(*) filter (where "severityCode" = 'A'),
    count(*) filter (where "severityCode" = 'I'),
    count(*)
    into vBlocking, vWarnings, vInfo, vTotal
    from "validationFinding"
   where "loadId" = pLoadId;

  -- Si no hay errores pasa a VALIDADA; si los hay, a CUARENTENA
  vNextStatus := case when vTotal = 0 then 'VALIDADA' else 'CUARENTENA' end;

  if vLoad."statusCode" is distinct from vNextStatus then
    update "dataLoad"
       set "statusCode" = vNextStatus
     where "loadId" = pLoadId;
  end if;

  return jsonb_build_object(
    'loadId', pLoadId,
    'statusCode', vNextStatus,
    'blocking', coalesce(vBlocking, 0),
    'warnings', coalesce(vWarnings, 0),
    'info', coalesce(vInfo, 0),
    'total', coalesce(vTotal, 0)
  );
end $$;
comment on function "fnValidarCarga"(uuid) is 'P0-4: validates a single dataLoad (V01-V07, V09-V11, V13), stores findings in validationFinding and transitions statusCode to VALIDADA (0 findings) or CUARENTENA.';

grant execute on function "fnValidarCarga"(uuid) to authenticated, service_role;
revoke execute on function "fnValidarCarga"(uuid) from anon, public;

-- 3. Permiso de aprobación en "dataLoad": permite a GROUP_CONTROLLER (writeAll) y a COMPANY_ACCOUNTANT
--    (canWriteCompany sobre su empresa) aprobar una carga VALIDADA; la máquina de estados (trgDataLoadStatus)
--    y el trigger trgDataLoadWorkflow impiden aprobar cargas con hallazgos bloqueantes o en otro estado.
drop policy if exists "pUpdate" on "dataLoad";
create policy "pUpdate" on "dataLoad" for update to authenticated
  using (authz."canWriteCompany"("companyId"))
  with check (authz."canWriteCompany"("companyId")
              and ("statusCode" <> 'APROBADA'
                   or authz."hasPermission"('approveLoads')
                   or authz."canWriteCompany"("companyId")));

-- 4. En entornos locales sin GoTrue, permite sincronizar el usuario recién creado en auth.users
--    y consultar los correos de auth.users cuando quien ejecuta la transacción tiene masterData.
create or replace function authz."fnEnsureAuthUser"(pUserId uuid, pEmail text) returns void
language plpgsql security definer set search_path = public, authz, pg_temp as $$
begin
  if not authz."hasPermission"('masterData') then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Requires masterData permission';
  end if;
  if to_regclass('auth.users') is not null then
    insert into auth.users (id, email)
    values (pUserId, pEmail)
    on conflict (id) do update set email = coalesce(excluded.email, auth.users.email);
  end if;
end $$;
comment on function authz."fnEnsureAuthUser"(uuid, text) is 'Ensures the user id exists in auth.users (no-op when GoTrue already inserted it; used in local tests). Requires masterData.';

create or replace function authz."fnListAuthUserEmails"()
returns table ("userId" uuid, "email" text)
language plpgsql stable security definer set search_path = public, authz, pg_temp as $$
begin
  if not authz."hasPermission"('masterData') then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Requires masterData permission';
  end if;
  if to_regclass('auth.users') is not null then
    return query select u.id as "userId", u.email::text as "email" from auth.users u;
  end if;
end $$;
comment on function authz."fnListAuthUserEmails"() is 'Returns (userId, email) from auth.users for masterData managers.';

grant execute on function authz."fnEnsureAuthUser"(uuid, text) to authenticated, service_role;
revoke execute on function authz."fnEnsureAuthUser"(uuid, text) from anon, public;
grant execute on function authz."fnListAuthUserEmails"() to authenticated, service_role;
revoke execute on function authz."fnListAuthUserEmails"() from anon, public;

commit;
