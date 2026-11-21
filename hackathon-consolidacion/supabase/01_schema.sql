-- =====================================================================
-- Multi-currency intercompany (IC) consolidation — schema (PostgreSQL 15+ / Supabase)
-- Run order: 01_schema.sql → 02_seed_master_data.sql → 03_seed_loads_v1_with_errors.sql
--            → 04_seed_loads_v2.sql → 05_security_rls.sql
--
-- Naming:  tables singular + camelCase, English. Identifiers are quoted ("groupAccount").
--          Catalog CODES (APROBADA, PYG, VENTAS…) are data and keep the values used by the
--          source CSVs and the reference engine, so results stay comparable with the oracle.
-- ACID:
--   Atomicity   whole script runs in one transaction; IC mirror legs, status changes and
--               supersession of loads happen inside the same statement transaction.
--   Consistency FKs to catalogs (no free-text codes), CHECKs, state machine per domain,
--               consistency triggers for IC legs, generated columns for derived figures.
--   Isolation   row locks (FOR SHARE / FOR UPDATE) on scenario and documents, advisory lock
--               for load versioning, partial unique indexes for "only one approved".
--   Durability  append-only change log, immutable consolidation results, soft delete
--               (isActive) on catalogs, IC documents are cancelled — never deleted.
-- Staging (dataLoadLine) intentionally has NO FKs so bad files can be received and validated.
-- Original Spanish schema kept in _original_es/ ; column comments carry "legacy:" names.
-- =====================================================================
begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. AUDIT INFRASTRUCTURE
-- ---------------------------------------------------------------------
create schema if not exists audit;
comment on schema audit is 'Append-only audit trail and audit helper functions.';

-- Supabase user id from the JWT (same source as auth.uid()); null for service/DB sessions.
create or replace function audit."currentUserId"() returns uuid
language plpgsql stable as $$
declare vSub text;
begin
  vSub := coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                   nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub');
  return vSub::uuid;
exception when invalid_text_representation then
  return null;
end $$;
comment on function audit."currentUserId"() is 'Authenticated Supabase user (JWT sub claim) or null for service-role / direct DB sessions.';

create table audit."changeLog" (
  "changeLogId"   bigint generated always as identity primary key,
  "tableName"     text        not null,
  "operation"     text        not null check ("operation" in ('INSERT','UPDATE','DELETE')),
  "recordKey"     jsonb       not null,
  "oldData"       jsonb,
  "newData"       jsonb,
  "changedFields" jsonb,
  "userId"        uuid        default audit."currentUserId"(),
  "dbRole"        text        not null default current_user,
  "reason"        text        default nullif(current_setting('app.change_reason', true), ''),
  "transactionId" bigint      not null default txid_current(),
  "changedAt"     timestamptz not null default now()
);
create index on audit."changeLog" ("tableName", "changedAt" desc);
create index on audit."changeLog" using gin ("recordKey");
comment on table  audit."changeLog" is 'Append-only log of every insert/update/delete on audited tables. Rows can never be modified or removed.';
comment on column audit."changeLog"."changeLogId"   is 'Surrogate key, monotonic.';
comment on column audit."changeLog"."tableName"     is 'Audited table name.';
comment on column audit."changeLog"."operation"     is 'INSERT, UPDATE or DELETE.';
comment on column audit."changeLog"."recordKey"     is 'Primary key of the affected row as JSON.';
comment on column audit."changeLog"."oldData"       is 'Full row before the change (UPDATE/DELETE).';
comment on column audit."changeLog"."newData"       is 'Full row after the change (INSERT/UPDATE).';
comment on column audit."changeLog"."changedFields" is 'UPDATE only: {field: {old, new}} for changed fields.';
comment on column audit."changeLog"."userId"        is 'Supabase user that made the change (null = service role / migration).';
comment on column audit."changeLog"."dbRole"        is 'Database role that executed the statement.';
comment on column audit."changeLog"."reason"        is 'Optional business reason: SET LOCAL app.change_reason = ''...'' before the change.';
comment on column audit."changeLog"."transactionId" is 'Transaction id: groups all changes made atomically together.';
comment on column audit."changeLog"."changedAt"     is 'Timestamp of the change.';

-- Generic "this row/table is immutable" guard.
create or replace function audit."fnRejectChange"() returns trigger language plpgsql as $$
begin
  raise exception using errcode = 'restrict_violation',
    message = format('%s on %I is not allowed: %s', tg_op, tg_table_name, coalesce(tg_argv[0], 'table is immutable'));
end $$;
comment on function audit."fnRejectChange"() is 'Trigger that rejects the operation (used for append-only / immutable tables).';

create trigger "trgChangeLogImmutable" before update or delete on audit."changeLog"
  for each row execute function audit."fnRejectChange"('audit log is append-only');
create trigger "trgChangeLogNoTruncate" before truncate on audit."changeLog"
  for each statement execute function audit."fnRejectChange"('audit log is append-only');

-- Row-level change logger. Trigger args = primary key column names.
create or replace function audit."fnLogChange"() returns trigger
language plpgsql security definer set search_path = public, audit as $$
declare
  vOld jsonb; vNew jsonb; vRow jsonb; vKey jsonb := '{}'; vDiff jsonb; i int;
begin
  if tg_op <> 'INSERT' then vOld := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then vNew := to_jsonb(new); end if;
  vRow := coalesce(vNew, vOld);
  for i in 0 .. tg_nargs - 1 loop
    vKey := vKey || jsonb_build_object(tg_argv[i], vRow -> tg_argv[i]);
  end loop;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('old', vOld -> n.key, 'new', n.value))
      into vDiff
      from jsonb_each(vNew) n
     where (vOld -> n.key) is distinct from n.value
       and n.key not in ('updatedAt', 'updatedBy');
    if vDiff is null then return null; end if;          -- no real change, nothing to log
  end if;
  insert into audit."changeLog" ("tableName", "operation", "recordKey", "oldData", "newData", "changedFields")
  values (tg_table_name, tg_op, vKey, vOld, vNew, vDiff);
  return null;
end $$;
comment on function audit."fnLogChange"() is 'AFTER trigger: writes the row change to audit.changeLog. Args: primary key columns.';

-- createdAt/createdBy/updatedAt/updatedBy stamps; creation stamps cannot be overwritten.
create or replace function audit."fnStampRow"() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new."createdAt" := now();
    new."createdBy" := audit."currentUserId"();
  else
    new."createdAt" := old."createdAt";
    new."createdBy" := old."createdBy";
    new."updatedAt" := now();
    new."updatedBy" := audit."currentUserId"();
  end if;
  return new;
end $$;
comment on function audit."fnStampRow"() is 'BEFORE trigger: maintains creation/update stamps and protects creation stamps.';

-- ---------------------------------------------------------------------
-- 1. CATALOGS (reference data — no hard-coded code lists in CHECKs or views)
-- ---------------------------------------------------------------------
create table "currency" (
  "currencyCode"  text primary key check ("currencyCode" ~ '^[A-Z]{3}$'),
  "name"          text not null,
  "decimalPlaces" int  not null default 2 check ("decimalPlaces" between 0 and 6)
);
comment on table  "currency" is 'ISO-4217 currencies used by the group (legacy: moneda).';
comment on column "currency"."currencyCode"  is 'ISO-4217 code, e.g. GTQ (legacy: moneda_id).';
comment on column "currency"."name"          is 'Currency name (legacy: nombre).';
comment on column "currency"."decimalPlaces" is 'Minor-unit decimals (legacy: decimales).';

create table "country" (
  "countryCode" text primary key check ("countryCode" ~ '^[A-Z]{2}$'),
  "name"        text not null,
  "taxIdLabel"  text not null
);
comment on table  "country" is 'ISO-3166 countries where group companies operate; drives local chart-of-accounts mapping.';
comment on column "country"."countryCode" is 'ISO-3166 alpha-2 code (legacy: pais).';
comment on column "country"."name"        is 'Country name.';
comment on column "country"."taxIdLabel"  is 'Local name of the tax id (NIT, RFC, EIN).';

create table "financialStatement" (
  "financialStatementCode" text primary key,
  "name"                   text not null,
  "defaultRateTypeCode"    text not null
);
comment on table  "financialStatement" is 'Financial statement / file type (legacy: tipo_archivo, estado_financiero).';
comment on column "financialStatement"."financialStatementCode" is 'PYG = income statement, BALANCE = balance sheet.';
comment on column "financialStatement"."name"                   is 'Description.';
comment on column "financialStatement"."defaultRateTypeCode"    is 'Rate type used to translate this statement to USD unless the group account overrides it.';

create table "rateType" (
  "rateTypeCode" text primary key,
  "name"         text not null,
  "description"  text
);
comment on table  "rateType" is 'Exchange-rate types (legacy: tipo_tasa CHECK list).';
comment on column "rateType"."rateTypeCode" is 'PRESUPUESTO, PROMEDIO, CIERRE, HISTORICA.';
comment on column "rateType"."name"         is 'Display name.';
comment on column "rateType"."description"  is 'When the rate applies.';

alter table "financialStatement" add foreign key ("defaultRateTypeCode") references "rateType";

create table "accountType" (
  "accountTypeCode"        text primary key,
  "name"                   text not null,
  "financialStatementCode" text not null references "financialStatement",
  "normalBalance"          text not null check ("normalBalance" in ('DEBIT','CREDIT')),
  "kpiSign"                smallint not null check ("kpiSign" in (-1, 1))
);
comment on table  "accountType" is 'Accounting element of a group account (legacy: cuenta_grupo.tipo CHECK list).';
comment on column "accountType"."accountTypeCode"        is 'ING income, GAS expense, ACT asset, PAS liability, PAT equity.';
comment on column "accountType"."name"                   is 'Display name.';
comment on column "accountType"."financialStatementCode" is 'Statement where this element is reported.';
comment on column "accountType"."normalBalance"          is 'Natural balance side.';
comment on column "accountType"."kpiSign"                is 'Sign applied when netting balances for KPIs (+1 ING/ACT, −1 GAS/PAS/PAT).';

create table "accountCategory" (
  "accountCategoryCode" text primary key,
  "name"                text not null,
  "kpiGroupCode"        text check ("kpiGroupCode" in ('EBIT','WORKING_CAPITAL','FIXED_ASSET')),
  "description"         text
);
comment on table  "accountCategory" is 'Reporting category of group accounts that feeds KPIs (legacy: cuenta_grupo.rubro).';
comment on column "accountCategory"."accountCategoryCode" is 'VENTAS, COSTO, GASTO_OP, CTO, AF, …';
comment on column "accountCategory"."name"                is 'Display name.';
comment on column "accountCategory"."kpiGroupCode"        is 'KPI bucket: EBIT (operating P&L), WORKING_CAPITAL, FIXED_ASSET; null = not used by KPIs.';
comment on column "accountCategory"."description"         is 'Free description.';

create table "severity" (
  "severityCode" text primary key,
  "name"         text not null,
  "isBlocking"   boolean not null,
  "requiresReasonToApprove" boolean not null
);
comment on table  "severity" is 'Validation finding severities (legacy: severidad B/A/I).';
comment on column "severity"."severityCode"            is 'B blocking, A warning, I informative.';
comment on column "severity"."name"                    is 'Display name.';
comment on column "severity"."isBlocking"              is 'A load with this severity can never be approved.';
comment on column "severity"."requiresReasonToApprove" is 'Approving a load with this severity requires dataLoad.statusReason.';

create table "statusDomain" (
  "domainCode" text primary key,
  "name"       text not null
);
comment on table  "statusDomain" is 'Business object families that have a lifecycle.';
comment on column "statusDomain"."domainCode" is 'LOAD, IC_DOCUMENT, SCENARIO, RECONCILIATION.';
comment on column "statusDomain"."name"       is 'Display name.';

create table "status" (
  "domainCode"          text not null references "statusDomain",
  "statusCode"          text not null,
  "name"                text not null,
  "sortOrder"           int  not null default 0,
  "isInitial"           boolean not null default false,
  "isFinal"             boolean not null default false,
  "isConsolidable"      boolean not null default false,
  "allowsElimination"   boolean not null default false,
  "blocksScenarioClose" boolean not null default false,
  primary key ("domainCode", "statusCode")
);
comment on table  "status" is 'Status catalog per domain (replaces the estado CHECK lists).';
comment on column "status"."domainCode"          is 'Domain this status belongs to.';
comment on column "status"."statusCode"          is 'Status code (kept in Spanish for oracle compatibility).';
comment on column "status"."name"                is 'English display name.';
comment on column "status"."sortOrder"           is 'Display/process order.';
comment on column "status"."isInitial"           is 'Rows may be created in this status.';
comment on column "status"."isFinal"             is 'No further transitions expected.';
comment on column "status"."isConsolidable"      is 'LOAD: lines in this status enter the consolidation.';
comment on column "status"."allowsElimination"   is 'RECONCILIATION: only documents in this status may be eliminated.';
comment on column "status"."blocksScenarioClose" is 'IC_DOCUMENT: a scenario cannot be closed (without reason) while documents are in this status.';

create table "statusTransition" (
  "domainCode"     text not null,
  "fromStatusCode" text not null,
  "toStatusCode"   text not null,
  "requiresReason" boolean not null default false,
  "isActive"       boolean not null default true,
  primary key ("domainCode", "fromStatusCode", "toStatusCode"),
  foreign key ("domainCode", "fromStatusCode") references "status",
  foreign key ("domainCode", "toStatusCode")   references "status",
  check ("fromStatusCode" <> "toStatusCode")
);
comment on table  "statusTransition" is 'Allowed lifecycle transitions; enforced by fnEnforceStatusTransition.';
comment on column "statusTransition"."domainCode"     is 'Domain.';
comment on column "statusTransition"."fromStatusCode" is 'Current status.';
comment on column "statusTransition"."toStatusCode"   is 'Target status.';
comment on column "statusTransition"."requiresReason" is 'Target row must carry a non-empty statusReason.';
comment on column "statusTransition"."isActive"       is 'Soft switch to disable a transition.';

create table "eliminationRule" (
  "eliminationRuleCode" text primary key,
  "name"                text not null,
  "phase"               smallint not null default 1
);
comment on table  "eliminationRule" is 'Consolidation elimination rules (legacy: eliminacion.regla free text).';
comment on column "eliminationRule"."eliminationRuleCode" is 'E1..E7.';
comment on column "eliminationRule"."name"                is 'What is eliminated.';
comment on column "eliminationRule"."phase"               is 'Implementation phase (1 = in scope, 2 = later).';

create table "lineageSourceType" (
  "sourceTypeCode" text primary key,
  "name"           text not null
);
comment on table  "lineageSourceType" is 'Origin types of a lineage contribution (legacy: linaje.origen_tipo).';
comment on column "lineageSourceType"."sourceTypeCode" is 'LINEA_CARGA, ELIMINACION_E1..E7, CTA_CONVERSION.';
comment on column "lineageSourceType"."name"           is 'Display name.';

create table "parameterDefinition" (
  "parameterCode" text primary key,
  "name"          text not null,
  "unit"          text not null check ("unit" in ('RATIO','USD','TIMES')),
  "minValue"      numeric,
  "maxValue"      numeric,
  check ("minValue" is null or "maxValue" is null or "minValue" <= "maxValue")
);
comment on table  "parameterDefinition" is 'Catalog of scenario parameters (legacy: parametro.parametro free text).';
comment on column "parameterDefinition"."parameterCode" is 'WACC, TOLERANCIA_FX_USD, …';
comment on column "parameterDefinition"."name"          is 'Meaning of the parameter.';
comment on column "parameterDefinition"."unit"          is 'RATIO (0.1 = 10 %), USD amount or TIMES multiplier.';
comment on column "parameterDefinition"."minValue"      is 'Lower bound accepted (inclusive).';
comment on column "parameterDefinition"."maxValue"      is 'Upper bound accepted (inclusive).';

create table "counterpartyType" (
  "counterpartyTypeCode" text primary key,
  "name"                 text not null,
  "isGroupMember"        boolean not null
);
comment on table  "counterpartyType" is 'Distinguishes group companies (intercompany) from external third parties.';
comment on column "counterpartyType"."counterpartyTypeCode" is 'INTERCOMPANY or THIRD_PARTY.';
comment on column "counterpartyType"."name"                 is 'Display name.';
comment on column "counterpartyType"."isGroupMember"        is 'True when the counterparty is a company of the group.';

create table "period" (
  "periodCode" text primary key check ("periodCode" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  "year"       int  not null,
  "month"      int  not null check ("month" between 1 and 12),
  "startDate"  date not null,
  "endDate"    date not null,
  unique ("year", "month"),
  check ("endDate" >= "startDate")
);
comment on table  "period" is 'Monthly calendar (YYYY-MM). FK target for rates and IC documents.';
comment on column "period"."periodCode" is 'YYYY-MM (legacy: periodo).';
comment on column "period"."year"       is 'Calendar year.';
comment on column "period"."month"      is 'Calendar month 1..12.';
comment on column "period"."startDate"  is 'First day of the month.';
comment on column "period"."endDate"    is 'Last day of the month.';

create table "validationRule" (
  "ruleCode"     text primary key check ("ruleCode" ~ '^V\d{2}$'),
  "description"  text not null,
  "severityCode" text not null references "severity"
);
comment on table  "validationRule" is 'Validator rules V01..V20 (legacy: regla_validacion).';
comment on column "validationRule"."ruleCode"     is 'Rule code (legacy: codigo).';
comment on column "validationRule"."description"  is 'What the rule checks (legacy: descripcion).';
comment on column "validationRule"."severityCode" is 'Default severity (legacy: severidad).';

create table "icDocumentType" (
  "icDocumentTypeCode"   text primary key,
  "name"                 text not null,
  "issuerPlAccountId"    text,   -- FK added after groupAccount; values set by 02_seed
  "receiverPlAccountId"  text,
  "issuerBsAccountId"    text,
  "receiverBsAccountId"  text,
  "eliminationRuleCode"  text references "eliminationRule"
);
comment on table  "icDocumentType" is 'IC transaction types and the group accounts each leg must hit (legacy: documento_ic.tipo CHECK list).';
comment on column "icDocumentType"."icDocumentTypeCode"  is 'VENTA, SERVICIO, INTERES, PRESTAMO, DIVIDENDO, NC, ACUERDO_PPTO.';
comment on column "icDocumentType"."name"                is 'Display name.';
comment on column "icDocumentType"."issuerPlAccountId"   is 'Income-statement account of the issuer (seller/lender) leg.';
comment on column "icDocumentType"."receiverPlAccountId" is 'Income-statement account of the receiver (buyer/borrower) leg.';
comment on column "icDocumentType"."issuerBsAccountId"   is 'Balance-sheet account of the issuer leg (receivable).';
comment on column "icDocumentType"."receiverBsAccountId" is 'Balance-sheet account of the receiver leg (payable).';
comment on column "icDocumentType"."eliminationRuleCode" is 'Elimination rule applied to this transaction type.';

-- ---------------------------------------------------------------------
-- 2. MASTER DATA
-- ---------------------------------------------------------------------
create table "company" (
  "companyId"              text primary key,
  "name"                   text not null,
  "countryCode"            text not null references "country",
  "functionalCurrencyCode" text not null references "currency",
  "taxId"                  text not null unique,
  "incomeTaxRate"          numeric(6,4) not null check ("incomeTaxRate" between 0 and 1),
  unique ("companyId", "taxId")
);
comment on table  "company" is 'Legal entities of the group (legacy: empresa). Each one is automatically an INTERCOMPANY counterparty.';
comment on column "company"."companyId"              is 'Company code, e.g. GT1 (legacy: empresa_id).';
comment on column "company"."name"                   is 'Legal name (legacy: nombre).';
comment on column "company"."countryCode"            is 'Country of incorporation (legacy: pais).';
comment on column "company"."functionalCurrencyCode" is 'Functional currency; always used for translation, never the file currency (legacy: moneda_funcional).';
comment on column "company"."taxId"                  is 'Tax id NIT/RFC/EIN; used by V13 to detect IC disguised as third party (legacy: id_fiscal).';
comment on column "company"."incomeTaxRate"          is 'Statutory income-tax rate 0..1 (legacy: tasa_isr).';

create table "counterparty" (
  "counterpartyId"       text primary key,
  "counterpartyTypeCode" text not null references "counterpartyType",
  "name"                 text not null,
  "taxId"                text not null unique,
  "countryCode"          text references "country",
  "companyId"            text unique,
  "isCustomer"           boolean not null default true,
  "isSupplier"           boolean not null default true,
  "isGeneric"            boolean not null default false,
  foreign key ("companyId", "taxId") references "company" ("companyId", "taxId") on update cascade,
  check (("counterpartyTypeCode" = 'INTERCOMPANY') = ("companyId" is not null)),
  check ("isCustomer" or "isSupplier")
);
comment on table  "counterparty" is 'Customers/suppliers. INTERCOMPANY rows are 1:1 with company (same taxId, enforced by FK); THIRD_PARTY rows are external. A taxId can exist only once, so a group company can never be registered as a third party.';
comment on column "counterparty"."counterpartyId"       is 'Code: IC-<companyId> for group companies, free code for third parties.';
comment on column "counterparty"."counterpartyTypeCode" is 'INTERCOMPANY or THIRD_PARTY.';
comment on column "counterparty"."name"                 is 'Legal name.';
comment on column "counterparty"."taxId"                is 'Tax id; unique across group companies and third parties (legacy: contraparte_id_fiscal).';
comment on column "counterparty"."countryCode"          is 'Country (null for generic third parties).';
comment on column "counterparty"."companyId"            is 'Group company represented (INTERCOMPANY only).';
comment on column "counterparty"."isCustomer"           is 'Acts as customer (we sell to it).';
comment on column "counterparty"."isSupplier"           is 'Acts as supplier/provider (we buy from it).';
comment on column "counterparty"."isGeneric"            is 'Bucket counterparty such as VARIOS (various third parties).';

create table "groupAccount" (
  "groupAccountId"      text primary key,
  "name"                text not null,
  "accountTypeCode"     text not null references "accountType",
  "accountCategoryCode" text not null references "accountCategory",
  "isIntercompany"      boolean not null default false,
  "icCounterAccountId"  text references "groupAccount" deferrable initially deferred,
  "isCurrent"           boolean,
  "rateTypeCode"        text references "rateType",
  check ("isIntercompany" = ("icCounterAccountId" is not null)),
  check ("icCounterAccountId" <> "groupAccountId")
);
comment on table  "groupAccount" is 'Group chart of accounts (legacy: cuenta_grupo).';
comment on column "groupAccount"."groupAccountId"      is 'Group account code (legacy: cuenta_grupo_id).';
comment on column "groupAccount"."name"                is 'Account name (legacy: nombre).';
comment on column "groupAccount"."accountTypeCode"     is 'Accounting element (legacy: tipo).';
comment on column "groupAccount"."accountCategoryCode" is 'KPI category (legacy: rubro).';
comment on column "groupAccount"."isIntercompany"      is 'Lines in this account require icPartner and icDocumentId (legacy: es_ic).';
comment on column "groupAccount"."icCounterAccountId"  is 'Mirror account of the other IC leg; must be reciprocal (legacy: cuenta_contraparte_ic).';
comment on column "groupAccount"."isCurrent"           is 'Balance sheet: current (true) / non-current (false); null for P&L (legacy: corriente S/N).';
comment on column "groupAccount"."rateTypeCode"        is 'Overrides financialStatement.defaultRateTypeCode, e.g. HISTORICA for share capital.';

create table "accountMapping" (
  "countryCode"      text not null references "country",
  "localAccountCode" text not null,
  "groupAccountId"   text not null references "groupAccount",
  primary key ("countryCode", "localAccountCode")
);
comment on table  "accountMapping" is 'Local chart of accounts → group account, per country (legacy: mapeo_cuenta).';
comment on column "accountMapping"."countryCode"      is 'Country of the local chart (legacy: pais).';
comment on column "accountMapping"."localAccountCode" is 'Local account code as it appears in files (legacy: cuenta_local).';
comment on column "accountMapping"."groupAccountId"   is 'Target group account (legacy: cuenta_grupo_id).';

create table "scenario" (
  "scenarioId"       text primary key,
  "description"      text,
  "statusCode"       text not null default 'ABIERTO',
  "statusReason"     text,
  "statusDomainCode" text not null generated always as ('SCENARIO') stored,
  foreign key ("statusDomainCode", "statusCode") references "status"
);
comment on table  "scenario" is 'Budget / forecast scenario, e.g. PPTO_V1 (legacy: escenario). A closed scenario is read-only.';
comment on column "scenario"."scenarioId"       is 'Scenario code (legacy: escenario_id).';
comment on column "scenario"."description"      is 'Description (legacy: descripcion).';
comment on column "scenario"."statusCode"       is 'ABIERTO / CERRADO (legacy: estado).';
comment on column "scenario"."statusReason"     is 'Reason for the last status change (required to reopen or to close with pending IC).';
comment on column "scenario"."statusDomainCode" is 'Constant SCENARIO; lets statusCode reference the generic status catalog.';

create table "parameter" (
  "scenarioId"    text not null references "scenario",
  "parameterCode" text not null references "parameterDefinition",
  "value"         numeric not null,
  "description"   text,
  primary key ("scenarioId", "parameterCode")
);
comment on table  "parameter" is 'Parameter values per scenario (legacy: parametro). History lives in audit.changeLog.';
comment on column "parameter"."scenarioId"    is 'Scenario (legacy: escenario_id).';
comment on column "parameter"."parameterCode" is 'Parameter (legacy: parametro).';
comment on column "parameter"."value"         is 'Value in the unit of parameterDefinition (legacy: valor).';
comment on column "parameter"."description"   is 'Free note (legacy: descripcion).';

create table "transferPricingPolicy" (
  "policyId"           text primary key,
  "icDocumentTypeCode" text not null references "icDocumentType",
  "description"        text,
  "minPct"             numeric(6,4) not null check ("minPct" >= 0),
  "maxPct"             numeric(6,4) not null,
  unique ("policyId", "icDocumentTypeCode"),
  check ("maxPct" >= "minPct")
);
comment on table  "transferPricingPolicy" is 'Transfer-pricing policies used by V14 (legacy: politica_tp).';
comment on column "transferPricingPolicy"."policyId"           is 'Policy code (legacy: politica_id).';
comment on column "transferPricingPolicy"."icDocumentTypeCode" is 'IC transaction type it governs (legacy: tipo_ic).';
comment on column "transferPricingPolicy"."description"        is 'Basis of the policy (legacy: descripcion).';
comment on column "transferPricingPolicy"."minPct"             is 'Minimum percentage, 0.02 = 2 % (legacy: pct_min).';
comment on column "transferPricingPolicy"."maxPct"             is 'Maximum percentage (legacy: pct_max).';

create table "groupExchangeRate" (
  "scenarioId"   text not null references "scenario",
  "periodCode"   text not null references "period",
  "currencyCode" text not null references "currency",
  "rateTypeCode" text not null references "rateType",
  "rateToUsd"    numeric(20,10) not null check ("rateToUsd" > 0),
  primary key ("scenarioId", "periodCode", "currencyCode", "rateTypeCode")
);
comment on table  "groupExchangeRate" is 'Single group rate table; no country translates with its own rates (legacy: tasa_grupo).';
comment on column "groupExchangeRate"."scenarioId"   is 'Scenario (legacy: escenario_id).';
comment on column "groupExchangeRate"."periodCode"   is 'Period YYYY-MM (legacy: periodo).';
comment on column "groupExchangeRate"."currencyCode" is 'Currency (legacy: moneda_id).';
comment on column "groupExchangeRate"."rateTypeCode" is 'Rate type (legacy: tipo_tasa).';
comment on column "groupExchangeRate"."rateToUsd"    is 'USD per 1 unit of currency, e.g. GTQ 0.128 (legacy: tasa_a_usd).';

-- FKs from the IC type catalog to the chart of accounts (accounts are master data → set in 02_seed).
alter table "icDocumentType"
  add foreign key ("issuerPlAccountId")   references "groupAccount",
  add foreign key ("receiverPlAccountId") references "groupAccount",
  add foreign key ("issuerBsAccountId")   references "groupAccount",
  add foreign key ("receiverBsAccountId") references "groupAccount";

-- ---------------------------------------------------------------------
-- 3. LOADS (staging accepts anything so it can be validated)
-- ---------------------------------------------------------------------
create table "dataLoad" (
  "loadId"                 uuid primary key default gen_random_uuid(),
  "companyId"              text not null references "company",
  "scenarioId"             text not null references "scenario",
  "financialStatementCode" text not null references "financialStatement",
  "fileName"               text not null,
  "fileHash"               text,
  "version"                int  not null check ("version" > 0),
  "statusCode"             text not null default 'RECIBIDA',
  "statusReason"           text,
  "statusDomainCode"       text not null generated always as ('LOAD') stored,
  "uploadedBy"             uuid default audit."currentUserId"(),
  "uploadedAt"             timestamptz not null default now(),
  "approvedBy"             uuid,
  "approvedAt"             timestamptz,
  foreign key ("statusDomainCode", "statusCode") references "status",
  unique ("companyId", "scenarioId", "financialStatementCode", "version")
);
create unique index "uqDataLoadOneApproved" on "dataLoad" ("companyId", "scenarioId", "financialStatementCode")
  where "statusCode" = 'APROBADA';
create index on "dataLoad" ("fileHash");
comment on table  "dataLoad" is 'One uploaded file per company/scenario/statement, versioned (legacy: carga). Only one APROBADA per key; approving a new version supersedes the previous one.';
comment on column "dataLoad"."loadId"                 is 'Surrogate key (legacy: carga_id).';
comment on column "dataLoad"."companyId"              is 'Company that owns the file (legacy: empresa_id).';
comment on column "dataLoad"."scenarioId"             is 'Scenario (legacy: escenario_id).';
comment on column "dataLoad"."financialStatementCode" is 'PYG or BALANCE (legacy: tipo_archivo).';
comment on column "dataLoad"."fileName"               is 'Original file name (legacy: nombre_archivo).';
comment on column "dataLoad"."fileHash"               is 'Content hash; repeated hash = V19 warning (legacy: archivo_hash).';
comment on column "dataLoad"."version"                is 'Auto-assigned 1..n per company/scenario/statement when omitted (legacy: version).';
comment on column "dataLoad"."statusCode"             is 'RECIBIDA → CUARENTENA / PENDIENTE_APROBACION → APROBADA → REEMPLAZADA (legacy: estado).';
comment on column "dataLoad"."statusReason"           is 'Justification; mandatory to approve with warnings (legacy: justificacion).';
comment on column "dataLoad"."statusDomainCode"       is 'Constant LOAD; lets statusCode reference the generic status catalog.';
comment on column "dataLoad"."uploadedBy"             is 'User that uploaded (legacy: subida_por).';
comment on column "dataLoad"."uploadedAt"             is 'Upload timestamp (legacy: subida_en).';
comment on column "dataLoad"."approvedBy"             is 'User that approved; set automatically (legacy: aprobada_por).';
comment on column "dataLoad"."approvedAt"             is 'Approval timestamp; set automatically (legacy: aprobada_en).';

create table "dataLoadLine" (
  "lineId"                  text primary key,
  "loadId"                  uuid not null references "dataLoad" on delete cascade,
  "rowNumber"               int  not null check ("rowNumber" > 0),
  "companyCode"             text,
  "scenarioCode"            text,
  "periodCode"              text,
  "localAccountCode"        text,
  "description"             text,
  "currencyCode"            text,
  "amount"                  numeric(20,2),
  "icPartnerCode"           text,
  "icDocumentId"            text,
  "transactionCurrencyCode" text,
  "transactionAmount"       numeric(20,2),
  "counterpartyTaxId"       text,
  "volume"                  numeric,
  "price"                   numeric,
  unique ("loadId", "rowNumber")
);
create index on "dataLoadLine" ("icDocumentId") where "icDocumentId" is not null;
comment on table  "dataLoadLine" is 'Raw file rows exactly as received (legacy: linea_carga). No FKs on purpose: the validator reports bad codes. Immutable once the load is APROBADA/REEMPLAZADA.';
comment on column "dataLoadLine"."lineId"                  is '<file>#fila<N>: lineage anchor (legacy: linea_id).';
comment on column "dataLoadLine"."loadId"                  is 'Parent load (legacy: carga_id).';
comment on column "dataLoadLine"."rowNumber"               is 'Row number in the file (legacy: fila).';
comment on column "dataLoadLine"."companyCode"             is 'Company as written in the file (legacy: empresa).';
comment on column "dataLoadLine"."scenarioCode"            is 'Scenario as written in the file (legacy: escenario).';
comment on column "dataLoadLine"."periodCode"              is 'Period YYYY-MM as written (legacy: periodo).';
comment on column "dataLoadLine"."localAccountCode"        is 'Local account code (legacy: cuenta_local).';
comment on column "dataLoadLine"."description"             is 'Line description (legacy: descripcion).';
comment on column "dataLoadLine"."currencyCode"            is 'Declared currency; must equal functional currency (V02) (legacy: moneda).';
comment on column "dataLoadLine"."amount"                  is 'Amount in declared currency, always positive (V07) (legacy: monto).';
comment on column "dataLoadLine"."icPartnerCode"           is 'Group company on the other side of an IC line (legacy: socio_ic).';
comment on column "dataLoadLine"."icDocumentId"            is 'IC document key used for matching (legacy: doc_ic_id).';
comment on column "dataLoadLine"."transactionCurrencyCode" is 'IC transaction currency (legacy: moneda_tx).';
comment on column "dataLoadLine"."transactionAmount"       is 'IC amount in transaction currency (legacy: monto_tx).';
comment on column "dataLoadLine"."counterpartyTaxId"       is 'Third-party tax id; VARIOS = generic (legacy: contraparte_id_fiscal).';
comment on column "dataLoadLine"."volume"                  is 'Units sold (legacy: volumen).';
comment on column "dataLoadLine"."price"                   is 'Unit price (legacy: precio).';

create table "validationFinding" (
  "findingId"     bigint generated always as identity primary key,
  "loadId"        uuid references "dataLoad" on delete cascade,
  "scenarioId"    text references "scenario",
  "ruleCode"      text not null references "validationRule",
  "severityCode"  text not null references "severity",
  "companyCode"   text,
  "recordRef"     text,
  "message"       text not null,
  "foundValue"    text,
  "expectedValue" text,
  "suggestion"    text,
  "impactUsd"     numeric(20,2) not null default 0,
  "createdAt"     timestamptz not null default now(),
  check ("loadId" is not null or "scenarioId" is not null)
);
create index on "validationFinding" ("loadId");
comment on table  "validationFinding" is 'Validator output (legacy: hallazgo_validacion). loadId null = cross-load or rate finding.';
comment on column "validationFinding"."findingId"     is 'Surrogate key (legacy: hallazgo_id).';
comment on column "validationFinding"."loadId"        is 'Load the finding belongs to (legacy: carga_id).';
comment on column "validationFinding"."scenarioId"    is 'Scenario (legacy: escenario_id).';
comment on column "validationFinding"."ruleCode"      is 'Rule violated (legacy: regla).';
comment on column "validationFinding"."severityCode"  is 'Severity (legacy: severidad).';
comment on column "validationFinding"."companyCode"   is 'Company involved, raw text (legacy: empresa).';
comment on column "validationFinding"."recordRef"     is 'lineId or other reference (legacy: registro).';
comment on column "validationFinding"."message"       is 'Human message (legacy: mensaje).';
comment on column "validationFinding"."foundValue"    is 'Value found (legacy: encontrado).';
comment on column "validationFinding"."expectedValue" is 'Value expected (legacy: esperado).';
comment on column "validationFinding"."suggestion"    is 'Suggested fix.';
comment on column "validationFinding"."impactUsd"     is 'Estimated USD impact, used to sort (legacy: impacto_usd).';
comment on column "validationFinding"."createdAt"     is 'Creation timestamp (legacy: creado_en).';

-- ---------------------------------------------------------------------
-- 4. INTERCOMPANY: document + mirrored receivable / payable
-- ---------------------------------------------------------------------
create table "icDocument" (
  "icDocumentId"            text not null,
  "version"                 int  not null default 1 check ("version" > 0),
  "scenarioId"              text not null references "scenario",
  "icDocumentTypeCode"      text not null references "icDocumentType",
  "issuerCompanyId"         text not null references "company",
  "receiverCompanyId"       text not null references "company",
  "transactionCurrencyCode" text not null references "currency",
  "transactionAmount"       numeric(20,2) not null check ("transactionAmount" > 0),
  "periodCode"              text not null references "period",
  "transferPricingPolicyId" text,
  "statusCode"              text not null default 'BORRADOR',
  "statusReason"            text,
  "statusDomainCode"        text not null generated always as ('IC_DOCUMENT') stored,
  primary key ("icDocumentId", "version"),
  foreign key ("transferPricingPolicyId", "icDocumentTypeCode")
    references "transferPricingPolicy" ("policyId", "icDocumentTypeCode"),
  foreign key ("statusDomainCode", "statusCode") references "status",
  check ("issuerCompanyId" <> "receiverCompanyId")
);
create index on "icDocument" ("issuerCompanyId");
create index on "icDocument" ("receiverCompanyId");
comment on table  "icDocument" is 'IC transaction between two group companies (legacy: documento_ic). Financial fields are frozen once issued; corrections = new version or credit note; never deleted after draft.';
comment on column "icDocument"."icDocumentId"            is 'Business key IC-<flow>-<period> (legacy: doc_ic_id).';
comment on column "icDocument"."version"                 is 'Document version; previous versions are immutable (legacy: version).';
comment on column "icDocument"."scenarioId"              is 'Scenario (legacy: escenario_id).';
comment on column "icDocument"."icDocumentTypeCode"      is 'Transaction type (legacy: tipo).';
comment on column "icDocument"."issuerCompanyId"         is 'Issuer = seller / service provider / lender; owns the receivable (legacy: emisor).';
comment on column "icDocument"."receiverCompanyId"       is 'Receiver = buyer / customer / borrower; owns the payable (legacy: receptor).';
comment on column "icDocument"."transactionCurrencyCode" is 'Transaction currency, used to reconcile (legacy: moneda_tx).';
comment on column "icDocument"."transactionAmount"       is 'Amount in transaction currency, > 0 (legacy: monto_tx).';
comment on column "icDocument"."periodCode"              is 'Accounting period (legacy: periodo).';
comment on column "icDocument"."transferPricingPolicyId" is 'Applicable TP policy; must match the document type (legacy: politica_tp_id).';
comment on column "icDocument"."statusCode"              is 'BORRADOR → EMITIDA → PENDIENTE_ACEPTACION → ACEPTADA/DISPUTADA → CONCILIADA → COMPENSADA | ANULADA (legacy: estado).';
comment on column "icDocument"."statusReason"            is 'Dispute / cancellation reason (legacy: motivo_disputa).';
comment on column "icDocument"."statusDomainCode"        is 'Constant IC_DOCUMENT; lets statusCode reference the generic status catalog.';

create table "icReceivable" (
  "receivableId"     uuid primary key default gen_random_uuid(),
  "icDocumentId"     text not null,
  "version"          int  not null,
  "companyId"        text not null references "company",
  "partnerCompanyId" text not null references "company",
  "currencyCode"     text not null references "currency",
  "amount"           numeric(20,2) not null check ("amount" > 0),
  "balance"          numeric(20,2) not null,
  foreign key ("icDocumentId", "version") references "icDocument",
  unique ("icDocumentId", "version"),
  check ("balance" between 0 and "amount"),
  check ("companyId" <> "partnerCompanyId")
);
comment on table  "icReceivable" is 'IC receivable of the issuer; created only by the mirror trigger when the document is issued (legacy: cxc_ic).';
comment on column "icReceivable"."receivableId"     is 'Surrogate key (legacy: cxc_id).';
comment on column "icReceivable"."icDocumentId"     is 'Source document (legacy: doc_ic_id).';
comment on column "icReceivable"."version"          is 'Source document version.';
comment on column "icReceivable"."companyId"        is 'Creditor = document issuer (legacy: empresa_id).';
comment on column "icReceivable"."partnerCompanyId" is 'Debtor = group customer (legacy: socio_ic).';
comment on column "icReceivable"."currencyCode"     is 'Transaction currency (legacy: moneda_tx).';
comment on column "icReceivable"."amount"           is 'Original amount (legacy: monto_tx).';
comment on column "icReceivable"."balance"          is 'Outstanding balance 0..amount (legacy: saldo_tx).';

create table "icPayable" (
  "payableId"        uuid primary key default gen_random_uuid(),
  "icDocumentId"     text not null,
  "version"          int  not null,
  "companyId"        text not null references "company",
  "partnerCompanyId" text not null references "company",
  "currencyCode"     text not null references "currency",
  "amount"           numeric(20,2) not null check ("amount" > 0),
  "balance"          numeric(20,2) not null,
  "acceptedBy"       uuid,
  "acceptedAt"       timestamptz,
  foreign key ("icDocumentId", "version") references "icDocument",
  unique ("icDocumentId", "version"),
  check ("balance" between 0 and "amount"),
  check ("companyId" <> "partnerCompanyId")
);
comment on table  "icPayable" is 'Mirror IC payable of the receiver; nobody creates it by hand (legacy: cxp_ic).';
comment on column "icPayable"."payableId"        is 'Surrogate key (legacy: cxp_id).';
comment on column "icPayable"."icDocumentId"     is 'Source document (legacy: doc_ic_id).';
comment on column "icPayable"."version"          is 'Source document version.';
comment on column "icPayable"."companyId"        is 'Debtor = document receiver (legacy: empresa_id).';
comment on column "icPayable"."partnerCompanyId" is 'Creditor = group supplier/provider (legacy: socio_ic).';
comment on column "icPayable"."currencyCode"     is 'Transaction currency (legacy: moneda_tx).';
comment on column "icPayable"."amount"           is 'Original amount (legacy: monto_tx).';
comment on column "icPayable"."balance"          is 'Outstanding balance 0..amount (legacy: saldo_tx).';
comment on column "icPayable"."acceptedBy"       is 'Receiver user that accepted the document (legacy: aceptada_por).';
comment on column "icPayable"."acceptedAt"       is 'Acceptance timestamp (legacy: aceptada_en).';

-- ---------------------------------------------------------------------
-- 5. CONSOLIDATION (every run is immutable)
-- ---------------------------------------------------------------------
create table "consolidationRun" (
  "runId"             uuid primary key default gen_random_uuid(),
  "scenarioId"        text not null references "scenario",
  "executedAt"        timestamptz not null default now(),
  "executedBy"        uuid default audit."currentUserId"(),
  "parameterSnapshot" jsonb,
  "ratesHash"         text,
  "lineageOk"         boolean,
  "notes"             text
);
comment on table  "consolidationRun" is 'One consolidation execution (legacy: corrida). Snapshots parameters and a hash of the rate table used.';
comment on column "consolidationRun"."runId"             is 'Surrogate key (legacy: corrida_id).';
comment on column "consolidationRun"."scenarioId"        is 'Scenario consolidated (legacy: escenario_id).';
comment on column "consolidationRun"."executedAt"        is 'Execution timestamp (legacy: ejecutada_en).';
comment on column "consolidationRun"."executedBy"        is 'User that ran it.';
comment on column "consolidationRun"."parameterSnapshot" is 'Parameters in force at run time {code: value}; set automatically.';
comment on column "consolidationRun"."ratesHash"         is 'md5 of the scenario rate table at run time; set automatically.';
comment on column "consolidationRun"."lineageOk"         is 'Σ lineage = consolidated check result; can be set once (legacy: linaje_ok).';
comment on column "consolidationRun"."notes"             is 'Free notes (legacy: notas).';

create table "consolidationRunLoad" (
  "runId"  uuid not null references "consolidationRun" on delete cascade,
  "loadId" uuid not null references "dataLoad",
  primary key ("runId", "loadId")
);
comment on table  "consolidationRunLoad" is 'Loads included in a run (replaces the uuid[] legacy column corrida.cargas); each must be APROBADA and of the run scenario.';
comment on column "consolidationRunLoad"."runId"  is 'Run.';
comment on column "consolidationRunLoad"."loadId" is 'Approved load included.';

create table "icReconciliation" (
  "runId"                  uuid not null references "consolidationRun" on delete cascade,
  "icDocumentId"           text not null,
  "financialStatementCode" text not null references "financialStatement",
  "issuerCompanyId"        text,
  "receiverCompanyId"      text,
  "statusCode"             text not null,
  "statusDomainCode"       text not null generated always as ('RECONCILIATION') stored,
  "issuerUsd"              numeric(20,2),
  "receiverUsd"            numeric(20,2),
  "differenceUsd"          numeric(20,2),
  "lineRefs"               text,
  primary key ("runId", "icDocumentId", "financialStatementCode"),
  foreign key ("statusDomainCode", "statusCode") references "status"
);
comment on table  "icReconciliation" is 'IC matching result per document and statement (legacy: conciliacion_ic). Companies are raw text: an orphan leg may carry an invalid partner.';
comment on column "icReconciliation"."runId"                  is 'Run (legacy: corrida_id).';
comment on column "icReconciliation"."icDocumentId"           is 'Document key (legacy: doc_ic_id).';
comment on column "icReconciliation"."financialStatementCode" is 'PYG or BALANCE (legacy: estado_financiero).';
comment on column "icReconciliation"."issuerCompanyId"        is 'Issuer (legacy: emisor).';
comment on column "icReconciliation"."receiverCompanyId"      is 'Receiver (legacy: receptor).';
comment on column "icReconciliation"."statusCode"             is 'CONCILIADO, CONCILIADO_FX, FX_FUERA_TOLERANCIA, DIFERENCIA_MONTO, DIFERENCIA_CORTE, SIN_CONTRAPARTE, SALDO_NO_CUADRA (legacy: estado).';
comment on column "icReconciliation"."statusDomainCode"       is 'Constant RECONCILIATION.';
comment on column "icReconciliation"."issuerUsd"              is 'Issuer leg in USD (legacy: usd_emisor).';
comment on column "icReconciliation"."receiverUsd"            is 'Receiver leg in USD (legacy: usd_receptor).';
comment on column "icReconciliation"."differenceUsd"          is 'issuerUsd − receiverUsd (legacy: diferencia_usd).';
comment on column "icReconciliation"."lineRefs"               is 'lineIds involved (legacy: lineas).';

create table "elimination" (
  "eliminationLineId"   bigint generated always as identity primary key,
  "runId"               uuid not null references "consolidationRun" on delete cascade,
  "eliminationCode"     text not null,
  "eliminationRuleCode" text not null references "eliminationRule",
  "icDocumentId"        text,
  "companyId"           text references "company",
  "groupAccountId"      text not null references "groupAccount",
  "effectUsd"           numeric(20,2) not null,
  "sourceRef"           text
);
create index on "elimination" ("runId", "groupAccountId");
comment on table  "elimination" is 'Elimination entries (one row per leg) (legacy: eliminacion). Only reconciled documents may be eliminated.';
comment on column "elimination"."eliminationLineId"   is 'Surrogate key.';
comment on column "elimination"."runId"               is 'Run (legacy: corrida_id).';
comment on column "elimination"."eliminationCode"     is 'Entry code shared by its legs, e.g. EL-0001 (legacy: elim_id).';
comment on column "elimination"."eliminationRuleCode" is 'Rule E1..E7 (legacy: regla).';
comment on column "elimination"."icDocumentId"        is 'IC document eliminated (legacy: doc_ic_id).';
comment on column "elimination"."companyId"           is 'Company whose balance is adjusted; null = group-level consolidation entry, e.g. E7 FX difference (oracle writes GRUPO) (legacy: empresa).';
comment on column "elimination"."groupAccountId"      is 'Group account adjusted (legacy: cuenta_grupo_id).';
comment on column "elimination"."effectUsd"           is '+ increases the natural balance, − decreases it (legacy: efecto_usd).';
comment on column "elimination"."sourceRef"           is 'lineId(s) eliminated (legacy: origen).';

create table "consolidatedBalance" (
  "runId"                    uuid not null references "consolidationRun" on delete cascade,
  "groupAccountId"           text not null references "groupAccount",
  "aggregatedUsd"            numeric(20,2) not null default 0,
  "eliminationsUsd"          numeric(20,2) not null default 0,
  "translationAdjustmentUsd" numeric(20,2) not null default 0,
  "consolidatedUsd"          numeric(20,2) generated always as ("aggregatedUsd" + "eliminationsUsd" + "translationAdjustmentUsd") stored,
  primary key ("runId", "groupAccountId")
);
comment on table  "consolidatedBalance" is 'Consolidated result per group account (legacy: consolidado). The total is derived, never captured.';
comment on column "consolidatedBalance"."runId"                    is 'Run (legacy: corrida_id).';
comment on column "consolidatedBalance"."groupAccountId"           is 'Group account (legacy: cuenta_grupo_id).';
comment on column "consolidatedBalance"."aggregatedUsd"            is 'Simple sum of approved loads in USD — double counts IC (legacy: agregado).';
comment on column "consolidatedBalance"."eliminationsUsd"          is 'Sum of eliminations (legacy: eliminaciones).';
comment on column "consolidatedBalance"."translationAdjustmentUsd" is 'Cumulative translation adjustment / CTA (legacy: cta_conversion).';
comment on column "consolidatedBalance"."consolidatedUsd"          is 'Generated: aggregated + eliminations + CTA (legacy: consolidado).';

create table "lineage" (
  "lineageId"       bigint generated always as identity primary key,
  "runId"           uuid not null references "consolidationRun" on delete cascade,
  "groupAccountId"  text not null references "groupAccount",
  "sourceTypeCode"  text not null references "lineageSourceType",
  "sourceId"        text,
  "companyId"       text references "company",
  "localAmount"     numeric(20,2),
  "currencyCode"    text references "currency",
  "rate"            numeric(20,10),
  "contributionUsd" numeric(20,2) not null
);
create index on "lineage" ("runId", "groupAccountId");
comment on table  "lineage" is 'Contribution of each source to each consolidated figure (legacy: linaje). Σ contributionUsd = consolidatedUsd.';
comment on column "lineage"."lineageId"       is 'Surrogate key.';
comment on column "lineage"."runId"           is 'Run (legacy: corrida_id).';
comment on column "lineage"."groupAccountId"  is 'Group account (legacy: cuenta_grupo_id).';
comment on column "lineage"."sourceTypeCode"  is 'Origin type (legacy: origen_tipo).';
comment on column "lineage"."sourceId"        is 'lineId, eliminationCode or CTA reference (legacy: origen_id).';
comment on column "lineage"."companyId"       is 'Company; null = group-level entry such as E7 or CTA (oracle writes GRUPO) (legacy: empresa).';
comment on column "lineage"."localAmount"     is 'Amount in local currency (legacy: monto_local).';
comment on column "lineage"."currencyCode"    is 'Local currency (legacy: moneda).';
comment on column "lineage"."rate"            is 'Rate applied (legacy: tasa).';
comment on column "lineage"."contributionUsd" is 'USD contribution (legacy: aporte_usd).';

-- ---------------------------------------------------------------------
-- 6. BUSINESS RULE TRIGGERS
-- ---------------------------------------------------------------------
-- 6.1 Generic state machine. Arg 0 = domain code (generated columns are not visible in BEFORE triggers).
create or replace function "fnEnforceStatusTransition"() returns trigger language plpgsql as $$
declare
  vDomain text := tg_argv[0];
  vTransition "statusTransition"%rowtype;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from "status" s
                    where s."domainCode" = vDomain and s."statusCode" = new."statusCode" and s."isInitial") then
      raise exception using errcode = 'check_violation',
        message = format('%s: rows cannot be created in status %s', vDomain, new."statusCode");
    end if;
    return new;
  end if;
  if new."statusCode" is not distinct from old."statusCode" then
    return new;
  end if;
  select * into vTransition from "statusTransition" t
   where t."domainCode" = vDomain and t."fromStatusCode" = old."statusCode"
     and t."toStatusCode" = new."statusCode" and t."isActive";
  if not found then
    raise exception using errcode = 'check_violation',
      message = format('%s: transition %s → %s is not allowed', vDomain, old."statusCode", new."statusCode");
  end if;
  if vTransition."requiresReason" and coalesce(btrim(new."statusReason"), '') = '' then
    raise exception using errcode = 'check_violation',
      message = format('%s: transition %s → %s requires statusReason', vDomain, old."statusCode", new."statusCode");
  end if;
  return new;
end $$;
comment on function "fnEnforceStatusTransition"() is 'BEFORE trigger: validates creation status and transitions against status / statusTransition.';

create trigger "trgScenarioStatus" before insert or update of "statusCode" on "scenario"
  for each row execute function "fnEnforceStatusTransition"('SCENARIO');
create trigger "trgDataLoadStatus" before insert or update of "statusCode" on "dataLoad"
  for each row execute function "fnEnforceStatusTransition"('LOAD');
create trigger "trgIcDocumentStatus" before insert or update of "statusCode" on "icDocument"
  for each row execute function "fnEnforceStatusTransition"('IC_DOCUMENT');

-- 6.2 Closed scenarios are read-only (rates, parameters, loads, IC documents).
--     FOR SHARE serializes against a concurrent close (isolation).
create or replace function "fnEnsureScenarioOpen"() returns trigger language plpgsql as $$
declare vScenario text; vStatus text;
begin
  vScenario := case when tg_op = 'DELETE' then old."scenarioId" else new."scenarioId" end;
  select "statusCode" into vStatus from "scenario" where "scenarioId" = vScenario for share;
  if vStatus = 'CERRADO' then
    raise exception using errcode = 'restrict_violation',
      message = format('Scenario %s is closed: %s on %I is not allowed', vScenario, tg_op, tg_table_name);
  end if;
  if tg_op = 'UPDATE' and old."scenarioId" is distinct from new."scenarioId" then
    raise exception using errcode = 'restrict_violation', message = 'scenarioId cannot be changed';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
comment on function "fnEnsureScenarioOpen"() is 'BEFORE trigger: rejects changes to data of a CERRADO scenario.';

create trigger "trgGroupExchangeRateScenarioOpen" before insert or update or delete on "groupExchangeRate"
  for each row execute function "fnEnsureScenarioOpen"();
create trigger "trgParameterScenarioOpen" before insert or update or delete on "parameter"
  for each row execute function "fnEnsureScenarioOpen"();
create trigger "trgDataLoadScenarioOpen" before insert or update or delete on "dataLoad"
  for each row execute function "fnEnsureScenarioOpen"();
create trigger "trgIcDocumentScenarioOpen" before insert or update or delete on "icDocument"
  for each row execute function "fnEnsureScenarioOpen"();

-- 6.3 Closing a scenario with pending/disputed IC documents requires a reason.
create or replace function "fnScenarioClose"() returns trigger language plpgsql as $$
declare vPending int;
begin
  if new."statusCode" = 'CERRADO' and old."statusCode" <> 'CERRADO' then
    select count(*) into vPending
      from "icDocument" d join "status" s on s."domainCode" = 'IC_DOCUMENT' and s."statusCode" = d."statusCode"
     where d."scenarioId" = new."scenarioId" and s."blocksScenarioClose";
    if vPending > 0 and coalesce(btrim(new."statusReason"), '') = '' then
      raise exception using errcode = 'check_violation',
        message = format('Scenario %s has %s pending/disputed IC documents: statusReason required to close', new."scenarioId", vPending);
    end if;
  end if;
  return new;
end $$;
comment on function "fnScenarioClose"() is 'BEFORE trigger: closing with pending IC documents needs statusReason.';
create trigger "trgScenarioClose" before update of "statusCode" on "scenario"
  for each row execute function "fnScenarioClose"();

-- 6.4 Group accounts: IC mirror accounts must be reciprocal (checked at commit).
create or replace function "fnCheckIcAccountPair"() returns trigger language plpgsql as $$
begin
  if new."icCounterAccountId" is not null and not exists (
       select 1 from "groupAccount" g
        where g."groupAccountId" = new."icCounterAccountId"
          and g."icCounterAccountId" = new."groupAccountId") then
    raise exception using errcode = 'check_violation',
      message = format('IC account %s points to %s, which does not point back', new."groupAccountId", new."icCounterAccountId");
  end if;
  return null;
end $$;
comment on function "fnCheckIcAccountPair"() is 'Deferred constraint trigger: icCounterAccountId must be reciprocal.';
create constraint trigger "trgGroupAccountIcPair" after insert or update on "groupAccount"
  deferrable initially deferred for each row execute function "fnCheckIcAccountPair"();

-- 6.5 Every company is automatically an INTERCOMPANY counterparty.
create or replace function "fnSyncCompanyCounterparty"() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into "counterparty" ("counterpartyId", "counterpartyTypeCode", "name", "taxId", "countryCode", "companyId")
  values ('IC-' || new."companyId", 'INTERCOMPANY', new."name", new."taxId", new."countryCode", new."companyId")
  on conflict ("companyId") do update
     set "name" = excluded."name", "countryCode" = excluded."countryCode";
  return null;
end $$;
comment on function "fnSyncCompanyCounterparty"() is 'AFTER trigger on company: creates/updates its INTERCOMPANY counterparty (taxId follows via FK ON UPDATE CASCADE).';
create trigger "trgCompanyCounterparty" after insert or update of "name", "countryCode" on "company"
  for each row execute function "fnSyncCompanyCounterparty"();

-- 6.6 Loads: auto-version (advisory lock), approval rules and supersession — all atomic.
create or replace function "fnDataLoadBeforeInsert"() returns trigger language plpgsql as $$
begin
  if new."version" is null then
    perform pg_advisory_xact_lock(hashtext(concat_ws('|', 'dataLoad', new."companyId", new."scenarioId", new."financialStatementCode")));
    select coalesce(max("version"), 0) + 1 into new."version"
      from "dataLoad"
     where "companyId" = new."companyId" and "scenarioId" = new."scenarioId"
       and "financialStatementCode" = new."financialStatementCode";
  end if;
  new."uploadedBy" := coalesce(audit."currentUserId"(), new."uploadedBy");
  new."uploadedAt" := now();
  new."approvedBy" := null;
  new."approvedAt" := null;
  return new;
end $$;
comment on function "fnDataLoadBeforeInsert"() is 'BEFORE INSERT: assigns the next version under an advisory lock.';
create trigger "trgDataLoadBeforeInsert" before insert on "dataLoad"
  for each row execute function "fnDataLoadBeforeInsert"();

create or replace function "fnDataLoadApproval"() returns trigger language plpgsql as $$
declare vBlocking int; vNeedsReason int;
begin
  if new."statusCode" = 'APROBADA' and old."statusCode" <> 'APROBADA' then
    select count(*) filter (where s."isBlocking"),
           count(*) filter (where s."requiresReasonToApprove")
      into vBlocking, vNeedsReason
      from "validationFinding" f join "severity" s using ("severityCode")
     where f."loadId" = new."loadId";
    if vBlocking > 0 then
      raise exception using errcode = 'check_violation',
        message = format('Load %s has %s blocking findings and cannot be approved', new."loadId", vBlocking);
    end if;
    if vNeedsReason > 0 and coalesce(btrim(new."statusReason"), '') = '' then
      raise exception using errcode = 'check_violation',
        message = format('Load %s has %s warnings: statusReason (justification) required', new."loadId", vNeedsReason);
    end if;
    -- supersede the previously approved version (same transaction → atomic swap)
    update "dataLoad"
       set "statusCode" = 'REEMPLAZADA', "statusReason" = format('Superseded by version %s (%s)', new."version", new."loadId")
     where "companyId" = new."companyId" and "scenarioId" = new."scenarioId"
       and "financialStatementCode" = new."financialStatementCode"
       and "statusCode" = 'APROBADA' and "loadId" <> new."loadId";
    new."approvedBy" := audit."currentUserId"();
    new."approvedAt" := now();
  elsif new."statusCode" <> 'APROBADA' then
    new."approvedBy" := old."approvedBy";
    new."approvedAt" := old."approvedAt";
  end if;
  if (new."companyId", new."financialStatementCode", new."version", new."fileName")
     is distinct from (old."companyId", old."financialStatementCode", old."version", old."fileName") then
    raise exception using errcode = 'restrict_violation', message = 'Load identity fields are immutable; upload a new version';
  end if;
  return new;
end $$;
comment on function "fnDataLoadApproval"() is 'BEFORE UPDATE: no approval with blocking findings, justification for warnings, supersedes previous approved version, stamps approver.';
create trigger "trgDataLoadWorkflow" before update on "dataLoad"
  for each row execute function "fnDataLoadApproval"();

-- Lines are frozen once the load entered (or left) the consolidation.
create or replace function "fnDataLoadLineFrozen"() returns trigger language plpgsql as $$
begin
  if exists (select 1 from "dataLoad" d where d."loadId" = old."loadId" and d."statusCode" in ('APROBADA', 'REEMPLAZADA')) then
    raise exception using errcode = 'restrict_violation',
      message = format('Line %s belongs to an approved/superseded load and is immutable', old."lineId");
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
comment on function "fnDataLoadLineFrozen"() is 'BEFORE UPDATE/DELETE: lines of APROBADA/REEMPLAZADA loads cannot change.';
create trigger "trgDataLoadLineFrozen" before update or delete on "dataLoadLine"
  for each row execute function "fnDataLoadLineFrozen"();

-- 6.7 IC documents: frozen financial fields, no hard delete after draft, mirror legs.
create or replace function "fnIcDocumentGuard"() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old."statusCode" <> 'BORRADOR' then
      raise exception using errcode = 'restrict_violation',
        message = format('IC document %s v%s is %s: cancel it (ANULADA) or issue a credit note, never delete', old."icDocumentId", old."version", old."statusCode");
    end if;
    return old;
  end if;
  if old."statusCode" <> 'BORRADOR' and
     (new."icDocumentTypeCode", new."issuerCompanyId", new."receiverCompanyId", new."transactionCurrencyCode",
      new."transactionAmount", new."periodCode", new."transferPricingPolicyId")
     is distinct from
     (old."icDocumentTypeCode", old."issuerCompanyId", old."receiverCompanyId", old."transactionCurrencyCode",
      old."transactionAmount", old."periodCode", old."transferPricingPolicyId") then
    raise exception using errcode = 'restrict_violation',
      message = format('IC document %s v%s is %s: financial fields are frozen, create a new version', old."icDocumentId", old."version", old."statusCode");
  end if;
  return new;
end $$;
comment on function "fnIcDocumentGuard"() is 'BEFORE UPDATE/DELETE: freezes financial fields after draft and forbids deleting issued documents.';
create trigger "trgIcDocumentGuard" before update or delete on "icDocument"
  for each row execute function "fnIcDocumentGuard"();

-- When a document is issued both legs are born in the same transaction. Nobody creates an IC payable by hand.
create or replace function "fnIcDocumentMirror"() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new."statusCode" = 'EMITIDA' and (tg_op = 'INSERT' or old."statusCode" is distinct from 'EMITIDA') then
    insert into "icReceivable" ("icDocumentId", "version", "companyId", "partnerCompanyId", "currencyCode", "amount", "balance")
    values (new."icDocumentId", new."version", new."issuerCompanyId", new."receiverCompanyId",
            new."transactionCurrencyCode", new."transactionAmount", new."transactionAmount")
    on conflict ("icDocumentId", "version") do nothing;
    insert into "icPayable" ("icDocumentId", "version", "companyId", "partnerCompanyId", "currencyCode", "amount", "balance")
    values (new."icDocumentId", new."version", new."receiverCompanyId", new."issuerCompanyId",
            new."transactionCurrencyCode", new."transactionAmount", new."transactionAmount")
    on conflict ("icDocumentId", "version") do nothing;
    update "icDocument" set "statusCode" = 'PENDIENTE_ACEPTACION'
     where "icDocumentId" = new."icDocumentId" and "version" = new."version";
  end if;
  return null;
end $$;
comment on function "fnIcDocumentMirror"() is 'AFTER trigger: on EMITIDA creates receivable (issuer) + payable (receiver) and moves the document to PENDIENTE_ACEPTACION.';
create trigger "trgIcDocumentMirror" after insert or update of "statusCode" on "icDocument"
  for each row execute function "fnIcDocumentMirror"();

-- Legs must mirror their document exactly; they can only be created while the document is being issued.
create or replace function "fnIcLegConsistency"() returns trigger language plpgsql as $$
declare d "icDocument"%rowtype; vOwner text; vPartner text;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'restrict_violation', message = format('%I rows cannot be deleted', tg_table_name);
  end if;
  select * into d from "icDocument" where "icDocumentId" = new."icDocumentId" and "version" = new."version" for share;
  if tg_op = 'INSERT' and d."statusCode" <> 'EMITIDA' then
    raise exception using errcode = 'restrict_violation',
      message = format('%I can only be created by issuing the IC document (fnIcDocumentMirror)', tg_table_name);
  end if;
  if tg_table_name = 'icReceivable' then
    vOwner := d."issuerCompanyId";   vPartner := d."receiverCompanyId";
  else
    vOwner := d."receiverCompanyId"; vPartner := d."issuerCompanyId";
  end if;
  if new."companyId" <> vOwner or new."partnerCompanyId" <> vPartner
  or new."currencyCode"     <> d."transactionCurrencyCode"
  or new."amount"           <> d."transactionAmount" then
    raise exception using errcode = 'check_violation',
      message = format('%I does not mirror IC document %s v%s', tg_table_name, new."icDocumentId", new."version");
  end if;
  return new;
end $$;
comment on function "fnIcLegConsistency"() is 'BEFORE trigger on icReceivable/icPayable: legs mirror the document, only born at issue time, never deleted.';
create trigger "trgIcReceivableConsistency" before insert or update or delete on "icReceivable"
  for each row execute function "fnIcLegConsistency"();
create trigger "trgIcPayableConsistency" before insert or update or delete on "icPayable"
  for each row execute function "fnIcLegConsistency"();

-- 6.8 Consolidation runs: snapshot, approved loads only, immutable results.
create or replace function "fnConsolidationRunSnapshot"() returns trigger language plpgsql as $$
begin
  perform 1 from "scenario" where "scenarioId" = new."scenarioId" for share;
  new."executedAt" := now();
  new."executedBy" := coalesce(audit."currentUserId"(), new."executedBy");
  new."parameterSnapshot" := (select jsonb_object_agg("parameterCode", "value")
                                from "parameter" where "scenarioId" = new."scenarioId");
  new."ratesHash" := (select md5(string_agg(concat_ws('|', "periodCode", "currencyCode", "rateTypeCode", "rateToUsd"), ','
                                            order by "periodCode", "currencyCode", "rateTypeCode"))
                        from "groupExchangeRate" where "scenarioId" = new."scenarioId");
  new."lineageOk" := null;
  return new;
end $$;
comment on function "fnConsolidationRunSnapshot"() is 'BEFORE INSERT: freezes parameters and rate-table hash used by the run.';
create trigger "trgConsolidationRunSnapshot" before insert on "consolidationRun"
  for each row execute function "fnConsolidationRunSnapshot"();

create or replace function "fnConsolidationRunUpdate"() returns trigger language plpgsql as $$
begin
  if (new."scenarioId", new."executedAt", new."executedBy", new."parameterSnapshot", new."ratesHash")
     is distinct from (old."scenarioId", old."executedAt", old."executedBy", old."parameterSnapshot", old."ratesHash")
     or (old."lineageOk" is not null and new."lineageOk" is distinct from old."lineageOk") then
    raise exception using errcode = 'restrict_violation', message = 'Consolidation runs are immutable (only notes and a first lineageOk can be set)';
  end if;
  return new;
end $$;
comment on function "fnConsolidationRunUpdate"() is 'BEFORE UPDATE: a run is immutable except notes and setting lineageOk once.';
create trigger "trgConsolidationRunUpdate" before update on "consolidationRun"
  for each row execute function "fnConsolidationRunUpdate"();

create or replace function "fnConsolidationRunLoadCheck"() returns trigger language plpgsql as $$
begin
  if not exists (
       select 1 from "dataLoad" d
         join "consolidationRun" r on r."runId" = new."runId"
         join "status" s on s."domainCode" = 'LOAD' and s."statusCode" = d."statusCode"
        where d."loadId" = new."loadId" and d."scenarioId" = r."scenarioId" and s."isConsolidable") then
    raise exception using errcode = 'check_violation',
      message = format('Load %s is not approved or does not belong to the run scenario', new."loadId");
  end if;
  return new;
end $$;
comment on function "fnConsolidationRunLoadCheck"() is 'BEFORE INSERT: only consolidable (APROBADA) loads of the same scenario enter a run.';
create trigger "trgConsolidationRunLoadCheck" before insert on "consolidationRunLoad"
  for each row execute function "fnConsolidationRunLoadCheck"();

create or replace function "fnEliminationRequiresReconciliation"() returns trigger language plpgsql as $$
begin
  if new."icDocumentId" is not null and not exists (
       select 1 from "icReconciliation" r
         join "status" s on s."domainCode" = 'RECONCILIATION' and s."statusCode" = r."statusCode"
        where r."runId" = new."runId" and r."icDocumentId" = new."icDocumentId" and s."allowsElimination") then
    raise exception using errcode = 'check_violation',
      message = format('IC document %s is not reconciled in run %s: only reconciled documents are eliminated', new."icDocumentId", new."runId");
  end if;
  return new;
end $$;
comment on function "fnEliminationRequiresReconciliation"() is 'BEFORE INSERT: eliminations only for documents reconciled (allowsElimination) in the same run.';
create trigger "trgEliminationRequiresReconciliation" before insert on "elimination"
  for each row execute function "fnEliminationRequiresReconciliation"();

create trigger "trgConsolidationRunLoadImmutable" before update on "consolidationRunLoad"
  for each row execute function audit."fnRejectChange"('run results are immutable');
create trigger "trgIcReconciliationImmutable" before update on "icReconciliation"
  for each row execute function audit."fnRejectChange"('run results are immutable');
create trigger "trgEliminationImmutable" before update on "elimination"
  for each row execute function audit."fnRejectChange"('run results are immutable');
create trigger "trgConsolidatedBalanceImmutable" before update on "consolidatedBalance"
  for each row execute function audit."fnRejectChange"('run results are immutable');
create trigger "trgLineageImmutable" before update on "lineage"
  for each row execute function audit."fnRejectChange"('run results are immutable');

-- ---------------------------------------------------------------------
-- 7. AUDIT WIRING (stamps + change log)
-- ---------------------------------------------------------------------
do $$
declare
  vTable text;
  vPk text;
  -- catalogs and master data: stamps + isActive + full change log
  vMaster text[] := array['currency','country','financialStatement','rateType','accountType','accountCategory',
    'severity','statusDomain','status','statusTransition','eliminationRule','lineageSourceType',
    'parameterDefinition','counterpartyType','period','validationRule','icDocumentType',
    'company','counterparty','groupAccount','accountMapping','scenario','parameter',
    'transferPricingPolicy','groupExchangeRate'];
  -- transactional tables: full change log
  vTransactional text[] := array['dataLoad','icDocument','icReceivable','icPayable','consolidationRun'];
begin
  foreach vTable in array vMaster || array['icDocument'] loop
    execute format('alter table %I
                      add column "createdAt" timestamptz not null default now(),
                      add column "createdBy" uuid default audit."currentUserId"(),
                      add column "updatedAt" timestamptz,
                      add column "updatedBy" uuid', vTable);
    execute format('comment on column %I."createdAt" is %L', vTable, 'Creation timestamp (protected).');
    execute format('comment on column %I."createdBy" is %L', vTable, 'Creating user (protected).');
    execute format('comment on column %I."updatedAt" is %L', vTable, 'Last update timestamp.');
    execute format('comment on column %I."updatedBy" is %L', vTable, 'Last updating user.');
    execute format('create trigger "trgStampRow" before insert or update on %I for each row execute function audit."fnStampRow"()', vTable);
  end loop;

  foreach vTable in array vMaster loop
    execute format('alter table %I add column if not exists "isActive" boolean not null default true', vTable);
    execute format('comment on column %I."isActive" is %L', vTable, 'Soft delete: inactive rows stay for history and referential integrity.');
  end loop;

  foreach vTable in array vMaster || vTransactional loop
    select string_agg(quote_literal(a.attname), ', ' order by k.ord) into vPk
      from pg_index i
      cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where i.indrelid = format('public.%I', vTable)::regclass and i.indisprimary;
    execute format('create trigger "trgChangeLog" after insert or update or delete on %I
                      for each row execute function audit."fnLogChange"(%s)', vTable, vPk);
  end loop;

  -- staging lines and findings: log only modifications/removals (inserts are bulk and traced by dataLoad)
  execute 'create trigger "trgChangeLog" after update or delete on "dataLoadLine"
             for each row execute function audit."fnLogChange"(''lineId'')';
  execute 'create trigger "trgChangeLog" after update or delete on "validationFinding"
             for each row execute function audit."fnLogChange"(''findingId'')';
end $$;

-- ---------------------------------------------------------------------
-- 8. CATALOG DATA (reference values; company-specific master data comes from 02_seed)
-- ---------------------------------------------------------------------
insert into "rateType" ("rateTypeCode", "name", "description") values
  ('PRESUPUESTO', 'Budget rate',     'Budget P&L translation'),
  ('PROMEDIO',    'Average rate',    'Actual P&L translation'),
  ('CIERRE',      'Closing rate',    'Balance sheet translation'),
  ('HISTORICA',   'Historical rate', 'Equity accounts (share capital)');

insert into "financialStatement" ("financialStatementCode", "name", "defaultRateTypeCode") values
  ('PYG',     'Income statement', 'PRESUPUESTO'),
  ('BALANCE', 'Balance sheet',    'CIERRE');

insert into "accountType" ("accountTypeCode", "name", "financialStatementCode", "normalBalance", "kpiSign") values
  ('ING', 'Income',    'PYG',     'CREDIT',  1),
  ('GAS', 'Expense',   'PYG',     'DEBIT',  -1),
  ('ACT', 'Asset',     'BALANCE', 'DEBIT',   1),
  ('PAS', 'Liability', 'BALANCE', 'CREDIT', -1),
  ('PAT', 'Equity',    'BALANCE', 'CREDIT', -1);

insert into "accountCategory" ("accountCategoryCode", "name", "kpiGroupCode") values
  ('VENTAS',       'Sales',                     'EBIT'),
  ('OTROS_ING_OP', 'Other operating income',    'EBIT'),
  ('COSTO',        'Cost of sales',             'EBIT'),
  ('GASTO_OP',     'Operating expenses',        'EBIT'),
  ('FINANCIERO',   'Financial result',          null),
  ('ISR',          'Income tax',                null),
  ('EFECTIVO',     'Cash',                      null),
  ('CTO',          'Operating working capital', 'WORKING_CAPITAL'),
  ('AF',           'Fixed assets',              'FIXED_ASSET'),
  ('PRESTAMO_IC',  'IC loans',                  null),
  ('DEUDA',        'Financial debt',            null),
  ('PATRIMONIO',   'Equity',                    null);

insert into "severity" ("severityCode", "name", "isBlocking", "requiresReasonToApprove") values
  ('B', 'Blocking',    true,  true),
  ('A', 'Warning',     false, true),
  ('I', 'Information', false, false);

insert into "statusDomain" ("domainCode", "name") values
  ('LOAD', 'Data load'), ('IC_DOCUMENT', 'IC document'), ('SCENARIO', 'Scenario'), ('RECONCILIATION', 'IC reconciliation');

insert into "status" ("domainCode", "statusCode", "name", "sortOrder", "isInitial", "isFinal", "isConsolidable", "allowsElimination", "blocksScenarioClose") values
  ('LOAD', 'RECIBIDA',             'Received',           1, true,  false, false, false, false),
  ('LOAD', 'CUARENTENA',           'Quarantined',        2, false, false, false, false, false),
  ('LOAD', 'PENDIENTE_APROBACION', 'Pending approval',   3, false, false, false, false, false),
  ('LOAD', 'APROBADA',             'Approved',           4, false, false, true,  false, false),
  ('LOAD', 'REEMPLAZADA',          'Superseded',         5, false, true,  false, false, false),
  ('IC_DOCUMENT', 'BORRADOR',             'Draft',              1, true,  false, false, false, true),
  ('IC_DOCUMENT', 'EMITIDA',              'Issued',             2, true,  false, false, false, true),
  ('IC_DOCUMENT', 'PENDIENTE_ACEPTACION', 'Pending acceptance', 3, false, false, false, false, true),
  ('IC_DOCUMENT', 'ACEPTADA',             'Accepted',           4, false, false, false, false, false),
  ('IC_DOCUMENT', 'DISPUTADA',            'Disputed',           5, false, false, false, false, true),
  ('IC_DOCUMENT', 'CONCILIADA',           'Reconciled',         6, false, false, false, false, false),
  ('IC_DOCUMENT', 'COMPENSADA',           'Settled',            7, false, true,  false, false, false),
  ('IC_DOCUMENT', 'ANULADA',              'Cancelled',          8, false, true,  false, false, false),
  ('SCENARIO', 'ABIERTO', 'Open',   1, true,  false, false, false, false),
  ('SCENARIO', 'CERRADO', 'Closed', 2, false, false, false, false, false),
  ('RECONCILIATION', 'CONCILIADO',          'N1 matched',                1, true, true, false, true,  false),
  ('RECONCILIATION', 'CONCILIADO_FX',       'N2 matched, FX within tolerance', 2, true, true, false, true,  false),
  ('RECONCILIATION', 'FX_FUERA_TOLERANCIA', 'FX difference out of tolerance',  3, true, true, false, false, false),
  ('RECONCILIATION', 'DIFERENCIA_MONTO',    'N3 amount difference',      4, true, true, false, false, false),
  ('RECONCILIATION', 'SIN_CONTRAPARTE',     'N4 orphan leg',             5, true, true, false, false, false),
  ('RECONCILIATION', 'DIFERENCIA_CORTE',    'N5 cut-off difference',     6, true, true, false, false, false),
  ('RECONCILIATION', 'SALDO_NO_CUADRA',     'N6 balance does not match', 7, true, true, false, false, false);

insert into "statusTransition" ("domainCode", "fromStatusCode", "toStatusCode", "requiresReason") values
  ('LOAD', 'RECIBIDA',             'CUARENTENA',           false),
  ('LOAD', 'RECIBIDA',             'PENDIENTE_APROBACION', false),
  ('LOAD', 'RECIBIDA',             'APROBADA',             false),
  ('LOAD', 'RECIBIDA',             'REEMPLAZADA',          false),
  ('LOAD', 'CUARENTENA',           'RECIBIDA',             false),
  ('LOAD', 'CUARENTENA',           'REEMPLAZADA',          false),
  ('LOAD', 'PENDIENTE_APROBACION', 'APROBADA',             true),
  ('LOAD', 'PENDIENTE_APROBACION', 'CUARENTENA',           false),
  ('LOAD', 'PENDIENTE_APROBACION', 'REEMPLAZADA',          false),
  ('LOAD', 'APROBADA',             'REEMPLAZADA',          false),
  ('IC_DOCUMENT', 'BORRADOR',             'EMITIDA',              false),
  ('IC_DOCUMENT', 'BORRADOR',             'ANULADA',              true),
  ('IC_DOCUMENT', 'EMITIDA',              'PENDIENTE_ACEPTACION', false),
  ('IC_DOCUMENT', 'PENDIENTE_ACEPTACION', 'ACEPTADA',             false),
  ('IC_DOCUMENT', 'PENDIENTE_ACEPTACION', 'DISPUTADA',            true),
  ('IC_DOCUMENT', 'DISPUTADA',            'PENDIENTE_ACEPTACION', true),
  ('IC_DOCUMENT', 'DISPUTADA',            'ANULADA',              true),
  ('IC_DOCUMENT', 'ACEPTADA',             'CONCILIADA',           false),
  ('IC_DOCUMENT', 'ACEPTADA',             'ANULADA',              true),
  ('IC_DOCUMENT', 'CONCILIADA',           'COMPENSADA',           false),
  ('SCENARIO', 'ABIERTO', 'CERRADO', false),
  ('SCENARIO', 'CERRADO', 'ABIERTO', true);

insert into "eliminationRule" ("eliminationRuleCode", "name", "phase") values
  ('E1', 'IC sales and services',          1),
  ('E2', 'IC receivable/payable balances', 1),
  ('E3', 'IC loans',                       1),
  ('E4', 'IC interest',                    1),
  ('E5', 'IC dividends',                   2),
  ('E6', 'Unrealized profit in inventory', 2),
  ('E7', 'IC FX difference',               1);

insert into "lineageSourceType" ("sourceTypeCode", "name")
select 'ELIMINACION_' || "eliminationRuleCode", 'Elimination ' || "eliminationRuleCode" from "eliminationRule";
insert into "lineageSourceType" ("sourceTypeCode", "name") values
  ('LINEA_CARGA', 'Approved load line'), ('CTA_CONVERSION', 'Cumulative translation adjustment');

insert into "parameterDefinition" ("parameterCode", "name", "unit", "minValue", "maxValue") values
  ('WACC',              'Group weighted average cost of capital',           'RATIO', 0, 1),
  ('TOLERANCIA_FX_USD', 'Absolute FX difference accepted per IC document',  'USD',   0, null),
  ('TOLERANCIA_FX_PCT', 'Relative FX difference accepted per IC document',  'RATIO', 0, 1),
  ('UMBRAL_ESCALA',     'Times over the account median that flags scale',   'TIMES', 1, null),
  ('BANDA_TASA_PCT',    'Max deviation of a rate vs its yearly median',     'RATIO', 0, 1);

insert into "counterpartyType" ("counterpartyTypeCode", "name", "isGroupMember") values
  ('INTERCOMPANY', 'Group company',        true),
  ('THIRD_PARTY',  'External third party', false);

insert into "counterparty" ("counterpartyId", "counterpartyTypeCode", "name", "taxId", "isGeneric") values
  ('T-VARIOS', 'THIRD_PARTY', 'Various third parties', 'VARIOS', true);

insert into "country" ("countryCode", "name", "taxIdLabel") values
  ('GT', 'Guatemala', 'NIT'), ('MX', 'Mexico', 'RFC'), ('US', 'United States', 'EIN');

insert into "period" ("periodCode", "year", "month", "startDate", "endDate")
select to_char(d, 'YYYY-MM'), extract(year from d)::int, extract(month from d)::int,
       d::date, (d + interval '1 month - 1 day')::date
  from generate_series(date '2025-01-01', date '2030-12-01', interval '1 month') d;

-- Account columns are filled by 02_seed once the chart of accounts exists.
insert into "icDocumentType" ("icDocumentTypeCode", "name", "eliminationRuleCode") values
  ('VENTA',        'IC sale of goods',      'E1'),
  ('SERVICIO',     'IC management service', 'E1'),
  ('INTERES',      'IC loan interest',      'E4'),
  ('PRESTAMO',     'IC loan principal',     'E3'),
  ('DIVIDENDO',    'IC dividend',           'E5'),
  ('NC',           'IC credit note',        'E1'),
  ('ACUERDO_PPTO', 'IC budget agreement',   null);

-- Parameter values must respect their definition range.
create or replace function "fnParameterInRange"() returns trigger language plpgsql as $$
declare d "parameterDefinition"%rowtype;
begin
  select * into d from "parameterDefinition" where "parameterCode" = new."parameterCode";
  if (d."minValue" is not null and new."value" < d."minValue") or (d."maxValue" is not null and new."value" > d."maxValue") then
    raise exception using errcode = 'check_violation',
      message = format('Parameter %s = %s outside [%s, %s]', new."parameterCode", new."value", d."minValue", d."maxValue");
  end if;
  return new;
end $$;
comment on function "fnParameterInRange"() is 'BEFORE trigger: parameter value within parameterDefinition range.';
create trigger "trgParameterInRange" before insert or update on "parameter"
  for each row execute function "fnParameterInRange"();

-- ---------------------------------------------------------------------
-- 9. TRANSACTIONAL API (each call is one atomic unit)
-- ---------------------------------------------------------------------
create or replace function "fnAcceptIcDocument"(pIcDocumentId text, pVersion int) returns void
language plpgsql as $$
declare vStatus text;
begin
  select "statusCode" into vStatus from "icDocument"
   where "icDocumentId" = pIcDocumentId and "version" = pVersion for update;
  if vStatus is distinct from 'PENDIENTE_ACEPTACION' then
    raise exception using errcode = 'check_violation',
      message = format('IC document %s v%s is %s, expected PENDIENTE_ACEPTACION (or not visible to you)', pIcDocumentId, pVersion, coalesce(vStatus, 'not found'));
  end if;
  -- the payable belongs to the receiver: under RLS only the receiver (or the group controller) can update it
  update "icPayable" set "acceptedBy" = audit."currentUserId"(), "acceptedAt" = now()
   where "icDocumentId" = pIcDocumentId and "version" = pVersion;
  if not found then
    raise exception using errcode = 'insufficient_privilege',
      message = format('Only the receiver company can accept IC document %s v%s', pIcDocumentId, pVersion);
  end if;
  update "icDocument" set "statusCode" = 'ACEPTADA'
   where "icDocumentId" = pIcDocumentId and "version" = pVersion;
end $$;
comment on function "fnAcceptIcDocument"(text, int) is 'Receiver accepts an issued IC document (legacy: fn_aceptar_ic). Row-locked, atomic.';

create or replace function "fnDisputeIcDocument"(pIcDocumentId text, pVersion int, pReason text) returns void
language plpgsql as $$
declare vStatus text;
begin
  select "statusCode" into vStatus from "icDocument"
   where "icDocumentId" = pIcDocumentId and "version" = pVersion for update;
  if vStatus is distinct from 'PENDIENTE_ACEPTACION' then
    raise exception using errcode = 'check_violation',
      message = format('IC document %s v%s is %s, expected PENDIENTE_ACEPTACION (or not visible to you)', pIcDocumentId, pVersion, coalesce(vStatus, 'not found'));
  end if;
  perform 1 from "icPayable" where "icDocumentId" = pIcDocumentId and "version" = pVersion for update;
  if not found then
    raise exception using errcode = 'insufficient_privilege',
      message = format('Only the receiver company can dispute IC document %s v%s', pIcDocumentId, pVersion);
  end if;
  update "icDocument" set "statusCode" = 'DISPUTADA', "statusReason" = pReason
   where "icDocumentId" = pIcDocumentId and "version" = pVersion;
end $$;
comment on function "fnDisputeIcDocument"(text, int, text) is 'Receiver disputes an issued IC document with a reason (legacy: fn_disputar_ic). Row-locked, atomic.';

-- ---------------------------------------------------------------------
-- 10. VIEWS (security_invoker → respect RLS of the caller)
-- ---------------------------------------------------------------------
-- Mapped line: group account (null = unmapped → V03) and rate type required.
create view "vMappedLine" with (security_invoker = true) as
select l.*,
       d."statusCode"             as "loadStatusCode",
       ls."isConsolidable",
       d."financialStatementCode",
       d."scenarioId",
       d."companyId",
       c."countryCode",
       c."functionalCurrencyCode",
       m."groupAccountId",
       g."accountTypeCode",
       g."accountCategoryCode",
       coalesce(g."isIntercompany", false) as "isIntercompany",
       coalesce(g."rateTypeCode", fs."defaultRateTypeCode") as "requiredRateTypeCode"
from "dataLoadLine" l
join "dataLoad" d            on d."loadId" = l."loadId"
join "status" ls             on ls."domainCode" = 'LOAD' and ls."statusCode" = d."statusCode"
join "company" c             on c."companyId" = d."companyId"
join "financialStatement" fs on fs."financialStatementCode" = d."financialStatementCode"
left join "accountMapping" m on m."countryCode" = c."countryCode" and m."localAccountCode" = l."localAccountCode"
left join "groupAccount" g   on g."groupAccountId" = m."groupAccountId";
comment on view "vMappedLine" is 'Load line + group account + required rate type (legacy: v_linea_mapeada).';

-- USD translation with the single group rate and the FUNCTIONAL currency (never the file currency).
create view "vLineUsd" with (security_invoker = true) as
select v.*, r."rateTypeCode", r."rateToUsd" as "rate", round(v."amount" * r."rateToUsd", 2) as "amountUsd"
from "vMappedLine" v
left join "groupExchangeRate" r
  on r."scenarioId" = v."scenarioId" and r."periodCode" = v."periodCode"
 and r."currencyCode" = v."functionalCurrencyCode" and r."rateTypeCode" = v."requiredRateTypeCode";
comment on view "vLineUsd" is 'Line translated to USD with the group rate (legacy: v_linea_usd).';

-- Aggregate (still DOUBLE COUNTS IC): consolidable loads only.
create view "vAggregate" with (security_invoker = true) as
select "scenarioId", "groupAccountId", round(sum("amountUsd"), 2) as "aggregatedUsd"
from "vLineUsd"
where "isConsolidable" and "groupAccountId" is not null
group by "scenarioId", "groupAccountId";
comment on view "vAggregate" is 'Simple sum per group account of approved loads (legacy: v_agregado).';

-- IC document pairing: issuer leg = credit-side income/asset, receiver leg = expense/liability.
create view "vIcPair" with (security_invoker = true) as
with ic as (
  select * from "vLineUsd" v
  where v."isIntercompany" and v."icDocumentId" is not null and v."isConsolidable"
)
select coalesce(a."scenarioId", b."scenarioId")                         as "scenarioId",
       coalesce(a."icDocumentId", b."icDocumentId")                     as "icDocumentId",
       coalesce(a."financialStatementCode", b."financialStatementCode") as "financialStatementCode",
       coalesce(a."companyCode", b."icPartnerCode")                     as "issuerCompanyId",
       coalesce(b."companyCode", a."icPartnerCode")                     as "receiverCompanyId",
       a."lineId" as "issuerLineId",            b."lineId" as "receiverLineId",
       a."transactionAmount" as "issuerTransactionAmount", b."transactionAmount" as "receiverTransactionAmount",
       a."periodCode" as "issuerPeriodCode",    b."periodCode" as "receiverPeriodCode",
       a."amountUsd" as "issuerUsd",            b."amountUsd" as "receiverUsd",
       a."amountUsd" - b."amountUsd"            as "differenceUsd"
from (select * from ic where "accountTypeCode" in ('ING', 'ACT')) a
full join (select * from ic where "accountTypeCode" in ('GAS', 'PAS')) b
  on a."scenarioId" = b."scenarioId" and a."icDocumentId" = b."icDocumentId"
 and a."financialStatementCode" = b."financialStatementCode";
comment on view "vIcPair" is 'Issuer vs receiver legs per IC document and statement (legacy: v_ic_pares).';

-- IC billing matrix: how much each company invoiced each other (USD, P&L).
create view "vIcBilledMatrix" with (security_invoker = true) as
select "scenarioId", "companyCode" as "issuerCompanyId", "icPartnerCode" as "receiverCompanyId",
       round(sum("amountUsd"), 2) as "billedUsd"
from "vLineUsd"
where "isIntercompany" and "accountTypeCode" = 'ING' and "financialStatementCode" = 'PYG' and "isConsolidable"
group by 1, 2, 3;
comment on view "vIcBilledMatrix" is 'Issuer × receiver IC billing in USD (legacy: v_matriz_ic_facturado).';

-- IC balances at closing (+ owed to me / − I owe).
create view "vIcBalanceMatrix" with (security_invoker = true) as
select "scenarioId", "companyCode" as "companyId", "icPartnerCode" as "partnerCompanyId",
       round(sum(case when "accountTypeCode" = 'ACT' then "amountUsd" else -"amountUsd" end), 2) as "balanceUsd"
from "vLineUsd"
where "isIntercompany" and "financialStatementCode" = 'BALANCE' and "isConsolidable"
group by 1, 2, 3;
comment on view "vIcBalanceMatrix" is 'IC balances per company pair in USD (legacy: v_matriz_ic_saldos).';

-- Counterparty resolution of load lines: separates intercompany from third parties (feeds V10, V11, V13).
create view "vLineCounterparty" with (security_invoker = true) as
select l."lineId", l."loadId", l."companyCode", l."localAccountCode", l."icPartnerCode", l."counterpartyTaxId",
       cp."counterpartyId"       as "icPartnerCounterpartyId",
       tp."counterpartyId"       as "taxIdCounterpartyId",
       tp."counterpartyTypeCode" as "taxIdCounterpartyTypeCode",
       case
         when l."icPartnerCode" is not null and cp."counterpartyId" is null then 'UNKNOWN_IC_PARTNER'
         when l."icPartnerCode" = l."companyCode"                           then 'SELF_BILLING'
         when l."icPartnerCode" is null and tp."counterpartyTypeCode" = 'INTERCOMPANY' then 'IC_RECORDED_AS_THIRD_PARTY'
         when l."counterpartyTaxId" is not null and tp."counterpartyId" is null      then 'UNREGISTERED_THIRD_PARTY'
       end as "alertCode"
from "dataLoadLine" l
left join "counterparty" cp on cp."companyId" = l."icPartnerCode"
left join "counterparty" tp on tp."taxId" = l."counterpartyTaxId";
comment on view "vLineCounterparty" is 'Resolves icPartnerCode / counterpartyTaxId to the counterparty master and flags IC disguised as third party (V13), self-billing (V11) and unknown partners.';

-- KPIs computed from a run (never captured). Buckets come from accountCategory.kpiGroupCode.
create view "vGroupKpi" with (security_invoker = true) as
with b as (
  select cb."runId",
         sum(cb."consolidatedUsd" * t."kpiSign") filter (where ac."kpiGroupCode" = 'EBIT')            as "ebitUsd",
         sum(cb."consolidatedUsd" * t."kpiSign") filter (where ac."kpiGroupCode" = 'WORKING_CAPITAL') as "workingCapitalUsd",
         sum(cb."consolidatedUsd" * t."kpiSign") filter (where ac."kpiGroupCode" = 'FIXED_ASSET')     as "fixedAssetsUsd",
         sum(cb."consolidatedUsd") filter (where g."accountTypeCode" = 'ACT')                         as "totalAssetsUsd",
         sum(cb."consolidatedUsd") filter (where g."accountTypeCode" = 'PAS' and g."isCurrent")       as "currentLiabilitiesUsd"
  from "consolidatedBalance" cb
  join "groupAccount" g     on g."groupAccountId" = cb."groupAccountId"
  join "accountType" t      on t."accountTypeCode" = g."accountTypeCode"
  join "accountCategory" ac on ac."accountCategoryCode" = g."accountCategoryCode"
  group by cb."runId"
)
select b.*,
       "workingCapitalUsd" + "fixedAssetsUsd"                    as "investedCapitalUsd",
       "totalAssetsUsd" - "currentLiabilitiesUsd"                as "capitalEmployedUsd",
       "ebitUsd" / nullif("totalAssetsUsd" - "currentLiabilitiesUsd", 0) as "roce"
from b;
comment on view "vGroupKpi" is 'Auditable KPI base per run (legacy: v_kpi_grupo). ROIC/EVA: NOPAT = EBIT×(1−t), EVA = NOPAT − WACC×investedCapital.';

commit;
