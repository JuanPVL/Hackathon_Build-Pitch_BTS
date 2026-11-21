-- =====================================================================
-- Row Level Security (Supabase). Run after 01..04.
-- Principle: a country user sees and loads only its own company and the IC documents /
-- mirror payables that involve it. Only GROUP_CONTROLLER sees the whole group, approves
-- loads and maintains master data; AUDITOR reads everything (incl. audit log), writes nothing.
-- service_role (backend / Edge Functions / SQL editor) bypasses RLS as usual in Supabase.
-- WARNING: after this script the anon key sees NOTHING; the app must sign users in and
-- each user needs at least one row in "userCompanyAccess".
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Access model
-- ---------------------------------------------------------------------
create table "accessRole" (
  "roleCode"             text primary key,
  "name"                 text not null,
  "canReadAllCompanies"  boolean not null default false,
  "canWriteAllCompanies" boolean not null default false,
  "canWriteOwnCompany"   boolean not null default false,
  "canApproveLoads"      boolean not null default false,
  "canManageMasterData"  boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "createdBy" uuid default audit."currentUserId"(),
  "updatedAt" timestamptz,
  "updatedBy" uuid,
  "isActive"  boolean not null default true
);
comment on table  "accessRole" is 'Application roles and the permissions they grant (checked by RLS policies).';
comment on column "accessRole"."roleCode"             is 'GROUP_CONTROLLER, AUDITOR, COMPANY_ACCOUNTANT, COMPANY_VIEWER.';
comment on column "accessRole"."name"                 is 'Display name.';
comment on column "accessRole"."canReadAllCompanies"  is 'Sees every company, IC matrix, consolidation runs and the audit log.';
comment on column "accessRole"."canWriteAllCompanies" is 'Writes data of any company and consolidation runs.';
comment on column "accessRole"."canWriteOwnCompany"   is 'Uploads loads / issues IC documents for the companies assigned.';
comment on column "accessRole"."canApproveLoads"      is 'May move a load to APROBADA (incl. approving warnings with justification).';
comment on column "accessRole"."canManageMasterData"  is 'Maintains catalogs, master data and user access.';
comment on column "accessRole"."createdAt" is 'Creation timestamp (protected).';
comment on column "accessRole"."createdBy" is 'Creating user (protected).';
comment on column "accessRole"."updatedAt" is 'Last update timestamp.';
comment on column "accessRole"."updatedBy" is 'Last updating user.';
comment on column "accessRole"."isActive"  is 'Soft delete.';

create table "userCompanyAccess" (
  "accessId"  bigint generated always as identity primary key,
  "userId"    uuid not null,
  "companyId" text references "company",
  "roleCode"  text not null references "accessRole",
  "createdAt" timestamptz not null default now(),
  "createdBy" uuid default audit."currentUserId"(),
  "updatedAt" timestamptz,
  "updatedBy" uuid,
  "isActive"  boolean not null default true,
  unique nulls not distinct ("userId", "companyId", "roleCode")
);
create index on "userCompanyAccess" ("userId") where "isActive";
comment on table  "userCompanyAccess" is 'Grants a Supabase user a role, for one company (companyId) or for the whole group (companyId null, group roles).';
comment on column "userCompanyAccess"."accessId"  is 'Surrogate key.';
comment on column "userCompanyAccess"."userId"    is 'auth.users.id of the Supabase user.';
comment on column "userCompanyAccess"."companyId" is 'Company the grant applies to; null = group level.';
comment on column "userCompanyAccess"."roleCode"  is 'Role granted.';
comment on column "userCompanyAccess"."createdAt" is 'Creation timestamp (protected).';
comment on column "userCompanyAccess"."createdBy" is 'Creating user (protected).';
comment on column "userCompanyAccess"."updatedAt" is 'Last update timestamp.';
comment on column "userCompanyAccess"."updatedBy" is 'Last updating user.';
comment on column "userCompanyAccess"."isActive"  is 'Revoke access without losing history.';

-- FK to Supabase auth users when available (absent in plain PostgreSQL).
do $$
begin
  if to_regclass('auth.users') is not null then
    alter table "userCompanyAccess" add foreign key ("userId") references auth.users (id) on delete cascade;
  end if;
end $$;

create trigger "trgStampRow" before insert or update on "accessRole"        for each row execute function audit."fnStampRow"();
create trigger "trgStampRow" before insert or update on "userCompanyAccess" for each row execute function audit."fnStampRow"();
create trigger "trgChangeLog" after insert or update or delete on "accessRole"
  for each row execute function audit."fnLogChange"('roleCode');
create trigger "trgChangeLog" after insert or update or delete on "userCompanyAccess"
  for each row execute function audit."fnLogChange"('accessId');

insert into "accessRole" ("roleCode", "name", "canReadAllCompanies", "canWriteAllCompanies", "canWriteOwnCompany", "canApproveLoads", "canManageMasterData") values
  ('GROUP_CONTROLLER',   'Group controller',   true,  true,  true,  true,  true),
  ('AUDITOR',            'Auditor',            true,  false, false, false, false),
  ('COMPANY_ACCOUNTANT', 'Company accountant', false, false, true,  false, false),
  ('COMPANY_VIEWER',     'Company viewer',     false, false, false, false, false);

-- ---------------------------------------------------------------------
-- 2. Permission helpers (SECURITY DEFINER: read access tables without recursion through RLS)
-- ---------------------------------------------------------------------
create schema if not exists authz;
comment on schema authz is 'Permission helper functions used by RLS policies.';

create or replace function authz."hasPermission"(pPermission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(bool_or(case pPermission
                            when 'readAll'      then r."canReadAllCompanies"
                            when 'writeAll'     then r."canWriteAllCompanies"
                            when 'approveLoads' then r."canApproveLoads"
                            when 'masterData'   then r."canManageMasterData"
                          end), false)
    from public."userCompanyAccess" a
    join public."accessRole" r on r."roleCode" = a."roleCode" and r."isActive"
   where a."userId" = audit."currentUserId"() and a."isActive"
$$;
comment on function authz."hasPermission"(text) is 'Group-level permission of the current user: readAll, writeAll, approveLoads, masterData.';

create or replace function authz."canReadCompany"(pCompanyId text) returns boolean
language sql stable security definer set search_path = '' as $$
  select authz."hasPermission"('readAll') or exists (
    select 1 from public."userCompanyAccess" a
      join public."accessRole" r on r."roleCode" = a."roleCode" and r."isActive"
     where a."userId" = audit."currentUserId"() and a."isActive" and a."companyId" = pCompanyId)
$$;
comment on function authz."canReadCompany"(text) is 'Current user can read data of the company.';

create or replace function authz."canWriteCompany"(pCompanyId text) returns boolean
language sql stable security definer set search_path = '' as $$
  select authz."hasPermission"('writeAll') or exists (
    select 1 from public."userCompanyAccess" a
      join public."accessRole" r on r."roleCode" = a."roleCode" and r."isActive"
     where a."userId" = audit."currentUserId"() and a."isActive"
       and a."companyId" = pCompanyId and r."canWriteOwnCompany")
$$;
comment on function authz."canWriteCompany"(text) is 'Current user can write data of the company.';

-- ---------------------------------------------------------------------
-- 3. Enable RLS everywhere; anon gets nothing
-- ---------------------------------------------------------------------
do $$
declare vTable text;
begin
  for vTable in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', vTable);
  end loop;
end $$;
alter table audit."changeLog" enable row level security;

revoke all on all tables in schema public from anon;
revoke all on audit."changeLog" from anon, authenticated;
grant usage on schema audit, authz to authenticated;
grant select on audit."changeLog" to authenticated;
grant execute on all functions in schema authz to authenticated;

-- ---------------------------------------------------------------------
-- 4. Policies
-- ---------------------------------------------------------------------
-- 4.1 Catalogs and master data: everybody signed in reads, only master-data managers write.
do $$
declare vTable text;
begin
  foreach vTable in array array['currency','country','financialStatement','rateType','accountType','accountCategory',
    'severity','statusDomain','status','statusTransition','eliminationRule','lineageSourceType',
    'parameterDefinition','counterpartyType','period','validationRule','icDocumentType',
    'company','counterparty','groupAccount','accountMapping','scenario','parameter',
    'transferPricingPolicy','groupExchangeRate','varianceEffect','accessRole'] loop
    execute format('create policy "pRead" on %I for select to authenticated using (true)', vTable);
    execute format('create policy "pManage" on %I for all to authenticated
                      using (authz."hasPermission"(''masterData'')) with check (authz."hasPermission"(''masterData''))', vTable);
  end loop;
end $$;

-- 4.2 User access: own grants visible; managed by master-data managers.
create policy "pReadOwn" on "userCompanyAccess" for select to authenticated
  using ("userId" = audit."currentUserId"() or authz."hasPermission"('masterData'));
create policy "pManage" on "userCompanyAccess" for all to authenticated
  using (authz."hasPermission"('masterData')) with check (authz."hasPermission"('masterData'));

-- 4.3 Loads: own company only; approval reserved to approvers.
create policy "pRead" on "dataLoad" for select to authenticated
  using (authz."canReadCompany"("companyId"));
create policy "pInsert" on "dataLoad" for insert to authenticated
  with check (authz."canWriteCompany"("companyId"));
create policy "pUpdate" on "dataLoad" for update to authenticated
  using (authz."canWriteCompany"("companyId"))
  with check (authz."canWriteCompany"("companyId")
              and ("statusCode" <> 'APROBADA' or authz."hasPermission"('approveLoads')));

create policy "pRead" on "dataLoadLine" for select to authenticated
  using (exists (select 1 from "dataLoad" d where d."loadId" = "dataLoadLine"."loadId" and authz."canReadCompany"(d."companyId")));
create policy "pInsert" on "dataLoadLine" for insert to authenticated
  with check (exists (select 1 from "dataLoad" d where d."loadId" = "dataLoadLine"."loadId"
                        and d."statusCode" = 'RECIBIDA' and authz."canWriteCompany"(d."companyId")));

create policy "pRead" on "validationFinding" for select to authenticated
  using (case when "loadId" is null then authz."hasPermission"('readAll')
              else exists (select 1 from "dataLoad" d where d."loadId" = "validationFinding"."loadId" and authz."canReadCompany"(d."companyId")) end);
create policy "pWrite" on "validationFinding" for all to authenticated
  using (case when "loadId" is null then authz."hasPermission"('writeAll')
              else exists (select 1 from "dataLoad" d where d."loadId" = "validationFinding"."loadId" and authz."canWriteCompany"(d."companyId")) end)
  with check (case when "loadId" is null then authz."hasPermission"('writeAll')
              else exists (select 1 from "dataLoad" d where d."loadId" = "validationFinding"."loadId" and authz."canWriteCompany"(d."companyId")) end);

-- 4.4 IC documents: issuer always; receiver once issued (drafts are private to the issuer).
create policy "pRead" on "icDocument" for select to authenticated
  using (authz."canReadCompany"("issuerCompanyId")
         or ("statusCode" <> 'BORRADOR' and authz."canReadCompany"("receiverCompanyId")));
create policy "pInsert" on "icDocument" for insert to authenticated
  with check (authz."canWriteCompany"("issuerCompanyId"));
create policy "pUpdate" on "icDocument" for update to authenticated
  using (authz."canWriteCompany"("issuerCompanyId")
         or ("statusCode" <> 'BORRADOR' and authz."canWriteCompany"("receiverCompanyId")))
  with check (authz."canWriteCompany"("issuerCompanyId") or authz."canWriteCompany"("receiverCompanyId"));
create policy "pDeleteDraft" on "icDocument" for delete to authenticated
  using ("statusCode" = 'BORRADOR' and authz."canWriteCompany"("issuerCompanyId"));

-- Receivable visible to the issuer, mirror payable to the receiver (created by the SECURITY DEFINER trigger).
create policy "pRead" on "icReceivable" for select to authenticated using (authz."canReadCompany"("companyId"));
create policy "pUpdate" on "icReceivable" for update to authenticated
  using (authz."canWriteCompany"("companyId")) with check (authz."canWriteCompany"("companyId"));
create policy "pRead" on "icPayable" for select to authenticated using (authz."canReadCompany"("companyId"));
create policy "pUpdate" on "icPayable" for update to authenticated
  using (authz."canWriteCompany"("companyId")) with check (authz."canWriteCompany"("companyId"));

-- 4.5 Consolidation results and variance explainer: group level only.
do $$
declare vTable text;
begin
  foreach vTable in array array['consolidationRun','consolidationRunLoad','icReconciliation',
                                'elimination','consolidatedBalance','lineage',
                                'varianceBridge','varianceBridgeLine','varianceBridgeEva'] loop
    execute format('create policy "pRead" on %I for select to authenticated using (authz."hasPermission"(''readAll''))', vTable);
    execute format('create policy "pWrite" on %I for all to authenticated
                      using (authz."hasPermission"(''writeAll'')) with check (authz."hasPermission"(''writeAll''))', vTable);
  end loop;
end $$;

-- 4.6 Audit log: read-only for auditors / controllers; inserts come from the SECURITY DEFINER trigger.
create policy "pRead" on audit."changeLog" for select to authenticated using (authz."hasPermission"('readAll'));

commit;
