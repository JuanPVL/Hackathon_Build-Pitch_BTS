-- =====================================================================
-- 09_ic_matrix_por_corrida.sql — QA-H4
-- Corre DESPUÉS de 07 (y del 08 si está aplicado). NO se ha aplicado a la
-- base en vivo: aplicarlo es decisión de Aroldo. Solo crea vistas.
--
-- Causa: "vIcBilledMatrix" / "vIcBalanceMatrix" leen las cargas APROBADA
-- actuales del escenario (isConsolidable), no la foto de una corrida.
-- La corrida V1 corregida del seed 06 no tiene consolidationRunLoad (las
-- cargas V1 en la base son las erróneas y no están APROBADA), así que
-- GET /api/runs/:runId/ic-matrix devolvía billed y balances vacíos.
--
-- Estas vistas arman la matriz de ESA corrida:
--   * Si la corrida tiene cargas asociadas, usa esas líneas (aunque luego
--     hayan pasado a REEMPLAZADA): es la foto de lo consolidado.
--   * Si no tiene cargas (V1 corregida del 06), usa la conciliación IC
--     guardada en la corrida (issuer/receiver y montos).
-- No invocan el motor ni tocan filas.
-- =====================================================================

create or replace view "vIcBilledMatrixByRun" with (security_invoker = true) as
select "runId", "issuerCompanyId", "receiverCompanyId", round(sum("amountUsd"), 2) as "billedUsd"
from (
  select rl."runId",
         v."companyCode" as "issuerCompanyId",
         v."icPartnerCode" as "receiverCompanyId",
         v."amountUsd"
    from "consolidationRunLoad" rl
    join "vLineUsd" v on v."loadId" = rl."loadId"
   where v."isIntercompany" and v."accountTypeCode" = 'ING' and v."financialStatementCode" = 'PYG'
     and v."icPartnerCode" is not null
  union all
  select r."runId", r."issuerCompanyId", r."receiverCompanyId", r."issuerUsd"
    from "icReconciliation" r
   where r."financialStatementCode" = 'PYG'
     and r."issuerCompanyId" is not null and r."receiverCompanyId" is not null
     and not exists (select 1 from "consolidationRunLoad" l where l."runId" = r."runId")
) x
group by 1, 2, 3;
comment on view "vIcBilledMatrixByRun" is 'QA-H4: IC billing matrix of a run (snapshot). From the run''s own loads, or from stored icReconciliation when the run has no attached loads.';

create or replace view "vIcBalanceMatrixByRun" with (security_invoker = true) as
select "runId", "companyId", "partnerCompanyId", round(sum("balanceUsd"), 2) as "balanceUsd"
from (
  select rl."runId",
         v."companyCode" as "companyId",
         v."icPartnerCode" as "partnerCompanyId",
         case when v."accountTypeCode" = 'ACT' then v."amountUsd" else -v."amountUsd" end as "balanceUsd"
    from "consolidationRunLoad" rl
    join "vLineUsd" v on v."loadId" = rl."loadId"
   where v."isIntercompany" and v."financialStatementCode" = 'BALANCE' and v."icPartnerCode" is not null
  union all
  select r."runId", r."issuerCompanyId", r."receiverCompanyId", r."issuerUsd"
    from "icReconciliation" r
   where r."financialStatementCode" = 'BALANCE' and r."issuerCompanyId" is not null
     and not exists (select 1 from "consolidationRunLoad" l where l."runId" = r."runId")
  union all
  select r."runId", r."receiverCompanyId", r."issuerCompanyId", -r."receiverUsd"
    from "icReconciliation" r
   where r."financialStatementCode" = 'BALANCE' and r."receiverCompanyId" is not null
     and not exists (select 1 from "consolidationRunLoad" l where l."runId" = r."runId")
) x
group by 1, 2, 3;
comment on view "vIcBalanceMatrixByRun" is 'QA-H4: IC balance matrix of a run (snapshot). From the run''s own loads, or from stored icReconciliation when the run has no attached loads.';

grant select on "vIcBilledMatrixByRun", "vIcBalanceMatrixByRun" to authenticated, service_role;
revoke all on "vIcBilledMatrixByRun", "vIcBalanceMatrixByRun" from anon, public;
