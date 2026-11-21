\set QUIET on
\pset footer off
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000c6') on conflict do nothing;
insert into "userCompanyAccess" ("userId", "companyId", "roleCode")
values ('00000000-0000-4000-8000-0000000000c6', null, 'GROUP_CONTROLLER');

create temp view fingerprint as
select (select count(*) from "consolidationRun") as runs,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "consolidationRun" t), '')) as run_md5,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "consolidationRunLoad" t), '')) as run_load_md5,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "icReconciliation" t), '')) as rec_md5,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "elimination" t), '')) as elim_md5,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "consolidatedBalance" t), '')) as cons_md5,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "lineage" t), '')) as lin_md5,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "varianceBridge" t), '')) as bridge_md5;
create temp table before06 as select * from fingerprint;
grant select on before06 to authenticated;

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c6","role":"authenticated"}', true) \gset
set local role authenticated;
select "fnConsolidar"('PPTO_V2') as new_run \gset
commit;

\echo '--- PPTO_V1 (cargas del 06 en CUARENTENA / PENDIENTE_APROBACION, ninguna APROBADA): debe fallar'
\set ON_ERROR_STOP off
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c6","role":"authenticated"}', true) \gset
set local role authenticated;
select "fnConsolidar"('PPTO_V1');
rollback;
\set ON_ERROR_STOP on

\echo '--- Corridas del 06 intactas (huella de las filas que no son de la corrida nueva)'
create temp view fingerprint_old as
select (select count(*) from "consolidationRun" where "runId" <> :'new_run') as runs,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "consolidationRun" t where "runId" <> :'new_run'), '')) as run_md5,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "consolidationRunLoad" t where "runId" <> :'new_run'), '')) as run_load_md5,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "icReconciliation" t where "runId" <> :'new_run'), '')) as rec_md5,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "elimination" t where "runId" <> :'new_run'), '')) as elim_md5,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "consolidatedBalance" t where "runId" <> :'new_run'), '')) as cons_md5,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "lineage" t where "runId" <> :'new_run'), '')) as lin_md5,
       md5(coalesce((select string_agg(t::text, '|' order by t::text) from "varianceBridge" t), '')) as bridge_md5;
select (select runs from before06) as runs_06, (select count(*) from "consolidationRun") as runs_now,
       (select row(b.*)::text from before06 b) = (select row(f.*)::text from fingerprint_old f) as rows_06_unchanged;

\echo '--- Corrida nueva vs corrida de referencia V2 del 06'
with ref as (select "runId" from "consolidationRun" where "notes" = 'Reference run loaded from oracle v2 results'),
     a as (select * from "consolidatedBalance" where "runId" = :'new_run'),
     b as (select * from "consolidatedBalance" where "runId" = (select "runId" from ref))
select count(*) as accounts,
       max(abs(coalesce(a."consolidatedUsd", 0) - coalesce(b."consolidatedUsd", 0))) as max_abs_diff_usd,
       (select "lineageOk" from "consolidationRun" where "runId" = :'new_run') as new_lineage_ok,
       (select count(*) from "icReconciliation" where "runId" = :'new_run') as reconciled_docs,
       (select count(*) from "elimination" where "runId" = :'new_run') as elimination_rows
from a full join b using ("groupAccountId");
