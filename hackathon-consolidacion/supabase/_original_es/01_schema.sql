-- =====================================================================
-- Consolidación IC multimoneda — esquema base (PostgreSQL / Supabase)
-- Orden de ejecución: 01_schema.sql → 02_seed_maestros.sql → 03_seed_cargas_*.sql
-- Principio: STAGING acepta todo (para poder validar); el CONSOLIDADO solo lee cargas APROBADAS.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. MAESTROS
-- ---------------------------------------------------------------------
create table moneda (
  moneda_id  text primary key,
  nombre     text not null,
  decimales  int  not null default 2
);

create table empresa (
  empresa_id       text primary key,
  nombre           text not null,
  pais             text not null,
  moneda_funcional text not null references moneda,
  id_fiscal        text not null unique,          -- usado por V13 (venta IC registrada como tercero)
  tasa_isr         numeric(6,4) not null check (tasa_isr between 0 and 1)
);

create table cuenta_grupo (
  cuenta_grupo_id      text primary key,
  nombre               text not null,
  tipo                 text not null check (tipo in ('ING','GAS','ACT','PAS','PAT')),
  rubro                text not null,             -- VENTAS, COSTO, GASTO_OP, CTO, AF, ... alimenta KPIs
  es_ic                boolean not null default false,
  cuenta_contraparte_ic text,
  corriente            text check (corriente in ('S','N') or corriente is null)
);

create table mapeo_cuenta (
  pais            text not null,
  cuenta_local    text not null,
  cuenta_grupo_id text not null references cuenta_grupo,
  primary key (pais, cuenta_local)
);

create table escenario (
  escenario_id text primary key,                  -- PPTO_V1, PPTO_V2
  descripcion  text,
  estado       text not null default 'ABIERTO' check (estado in ('ABIERTO','CERRADO'))
);

create table parametro (
  escenario_id text references escenario,
  parametro    text not null,                     -- WACC, TOLERANCIA_FX_USD, TOLERANCIA_FX_PCT, UMBRAL_ESCALA, BANDA_TASA_PCT
  valor        numeric not null,
  descripcion  text,
  primary key (escenario_id, parametro)
);

create table politica_tp (
  politica_id text primary key,
  tipo_ic     text not null,
  descripcion text,
  pct_min     numeric(6,4) not null,
  pct_max     numeric(6,4) not null
);

create table tasa_grupo (
  escenario_id text references escenario,
  periodo      text not null check (periodo ~ '^\d{4}-\d{2}$'),
  moneda_id    text not null references moneda,
  tipo_tasa    text not null check (tipo_tasa in ('PRESUPUESTO','PROMEDIO','CIERRE','HISTORICA')),
  tasa_a_usd   numeric(20,10) not null check (tasa_a_usd > 0),   -- 1 unidad de moneda = X USD
  primary key (escenario_id, periodo, moneda_id, tipo_tasa)
);

create table regla_validacion (
  codigo      text primary key,                  -- V01..V20
  descripcion text not null,
  severidad   text not null check (severidad in ('B','A','I'))
);

-- ---------------------------------------------------------------------
-- 2. CARGAS (staging: sin FKs duras para poder recibir datos malos y validarlos)
-- ---------------------------------------------------------------------
create table carga (
  carga_id       uuid primary key default gen_random_uuid(),
  empresa_id     text not null references empresa,
  escenario_id   text not null references escenario,
  tipo_archivo   text not null check (tipo_archivo in ('PYG','BALANCE')),
  nombre_archivo text not null,
  archivo_hash   text,
  version        int  not null default 1,
  estado         text not null default 'RECIBIDA'
                 check (estado in ('RECIBIDA','CUARENTENA','PENDIENTE_APROBACION','APROBADA','REEMPLAZADA')),
  subida_por     uuid,
  subida_en      timestamptz not null default now(),
  aprobada_por   uuid,
  aprobada_en    timestamptz,
  justificacion  text                                -- obligatorio si se aprueba con advertencias
);

create table linea_carga (
  linea_id              text primary key,             -- '<archivo>#fila<N>' : el ancla del linaje
  carga_id              uuid not null references carga on delete cascade,
  fila                  int  not null,
  empresa               text,
  escenario             text,
  periodo               text,
  cuenta_local          text,
  descripcion           text,
  moneda                text,
  monto                 numeric(20,2),
  socio_ic              text,
  doc_ic_id             text,
  moneda_tx             text,
  monto_tx              numeric(20,2),
  contraparte_id_fiscal text,
  volumen               numeric,
  precio                numeric
);
create index on linea_carga (carga_id);
create index on linea_carga (doc_ic_id) where doc_ic_id is not null;

create table hallazgo_validacion (
  hallazgo_id bigserial primary key,
  carga_id    uuid references carga on delete cascade,  -- null = hallazgo de tasas o cruce entre cargas
  escenario_id text references escenario,
  regla       text not null references regla_validacion,
  severidad   text not null,
  empresa     text,
  registro    text,                                   -- linea_id o referencia
  mensaje     text not null,
  encontrado  text,
  esperado    text,
  impacto_usd numeric(20,2) not null default 0,
  creado_en   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. INTERCOMPANY: documento + CxC + CxP espejo
-- ---------------------------------------------------------------------
create table documento_ic (
  doc_ic_id     text not null,
  version       int  not null default 1,
  escenario_id  text references escenario,
  tipo          text not null check (tipo in ('VENTA','SERVICIO','INTERES','PRESTAMO','DIVIDENDO','NC','ACUERDO_PPTO')),
  emisor        text not null references empresa,
  receptor      text not null references empresa,
  moneda_tx     text not null references moneda,
  monto_tx      numeric(20,2) not null,
  periodo       text not null,
  politica_tp_id text references politica_tp,
  estado        text not null default 'BORRADOR' check (estado in
                ('BORRADOR','EMITIDA','PENDIENTE_ACEPTACION','ACEPTADA','DISPUTADA','CONCILIADA','COMPENSADA','ANULADA')),
  motivo_disputa text,
  creado_en     timestamptz not null default now(),
  primary key (doc_ic_id, version),
  check (emisor <> receptor)
);

create table cxc_ic (
  cxc_id      uuid primary key default gen_random_uuid(),
  doc_ic_id   text not null, version int not null,
  empresa_id  text not null references empresa,       -- emisor
  socio_ic    text not null references empresa,       -- receptor (cliente del grupo)
  moneda_tx   text not null, monto_tx numeric(20,2) not null, saldo_tx numeric(20,2) not null,
  foreign key (doc_ic_id, version) references documento_ic,
  unique (doc_ic_id, version)
);

create table cxp_ic (
  cxp_id      uuid primary key default gen_random_uuid(),
  doc_ic_id   text not null, version int not null,
  empresa_id  text not null references empresa,       -- receptor
  socio_ic    text not null references empresa,       -- emisor (proveedor del grupo)
  moneda_tx   text not null, monto_tx numeric(20,2) not null, saldo_tx numeric(20,2) not null,
  aceptada_por uuid, aceptada_en timestamptz,
  foreign key (doc_ic_id, version) references documento_ic,
  unique (doc_ic_id, version)
);

-- Al EMITIR un documento IC nacen las dos patas. Nadie crea una CxP IC a mano.
create or replace function fn_ic_espejo() returns trigger language plpgsql as $$
begin
  if new.estado = 'EMITIDA' and (tg_op = 'INSERT' or old.estado is distinct from 'EMITIDA') then
    insert into cxc_ic (doc_ic_id, version, empresa_id, socio_ic, moneda_tx, monto_tx, saldo_tx)
    values (new.doc_ic_id, new.version, new.emisor, new.receptor, new.moneda_tx, new.monto_tx, new.monto_tx)
    on conflict (doc_ic_id, version) do nothing;
    insert into cxp_ic (doc_ic_id, version, empresa_id, socio_ic, moneda_tx, monto_tx, saldo_tx)
    values (new.doc_ic_id, new.version, new.receptor, new.emisor, new.moneda_tx, new.monto_tx, new.monto_tx)
    on conflict (doc_ic_id, version) do nothing;
    update documento_ic set estado = 'PENDIENTE_ACEPTACION'
     where doc_ic_id = new.doc_ic_id and version = new.version;
  end if;
  return null;
end $$;

create trigger trg_ic_espejo after insert or update of estado on documento_ic
  for each row execute function fn_ic_espejo();

create or replace function fn_aceptar_ic(p_doc text, p_version int, p_usuario uuid) returns void language sql as $$
  update cxp_ic set aceptada_por = p_usuario, aceptada_en = now() where doc_ic_id = p_doc and version = p_version;
  update documento_ic set estado = 'ACEPTADA' where doc_ic_id = p_doc and version = p_version and estado = 'PENDIENTE_ACEPTACION';
$$;

create or replace function fn_disputar_ic(p_doc text, p_version int, p_motivo text) returns void language sql as $$
  update documento_ic set estado = 'DISPUTADA', motivo_disputa = p_motivo
   where doc_ic_id = p_doc and version = p_version and estado = 'PENDIENTE_ACEPTACION';
$$;

-- ---------------------------------------------------------------------
-- 4. CONSOLIDACIÓN (cada corrida es inmutable)
-- ---------------------------------------------------------------------
create table corrida (
  corrida_id   uuid primary key default gen_random_uuid(),
  escenario_id text not null references escenario,
  ejecutada_en timestamptz not null default now(),
  cargas       uuid[] not null,
  linaje_ok    boolean,
  notas        text
);

create table conciliacion_ic (
  corrida_id        uuid references corrida on delete cascade,
  doc_ic_id         text,
  estado_financiero text check (estado_financiero in ('PYG','BALANCE')),
  emisor text, receptor text,
  estado text check (estado in ('CONCILIADO','CONCILIADO_FX','FX_FUERA_TOLERANCIA','DIFERENCIA_MONTO','DIFERENCIA_CORTE','SIN_CONTRAPARTE')),
  usd_emisor numeric(20,2), usd_receptor numeric(20,2), diferencia_usd numeric(20,2),
  lineas text,
  primary key (corrida_id, doc_ic_id, estado_financiero)
);

create table eliminacion (
  elim_id     text,
  corrida_id  uuid references corrida on delete cascade,
  regla       text not null,          -- E1 ventas/servicios IC, E2 saldos, E3 préstamos, E4 intereses, E7 dif. FX
  doc_ic_id   text,
  empresa     text,
  cuenta_grupo_id text references cuenta_grupo,
  efecto_usd  numeric(20,2) not null, -- + aumenta el saldo natural de la cuenta, − lo disminuye
  origen      text                    -- linea_id(s) eliminadas
);

create table consolidado (
  corrida_id      uuid references corrida on delete cascade,
  cuenta_grupo_id text references cuenta_grupo,
  agregado        numeric(20,2) not null default 0,
  eliminaciones   numeric(20,2) not null default 0,
  cta_conversion  numeric(20,2) not null default 0,
  consolidado     numeric(20,2) not null,
  primary key (corrida_id, cuenta_grupo_id)
);

create table linaje (
  corrida_id      uuid references corrida on delete cascade,
  cuenta_grupo_id text,
  origen_tipo     text,               -- LINEA_CARGA | ELIMINACION_Ex | CTA_CONVERSION
  origen_id       text,
  empresa         text,
  monto_local     numeric(20,2),
  moneda          text,
  tasa            numeric(20,10),
  aporte_usd      numeric(20,2)
);
create index on linaje (corrida_id, cuenta_grupo_id);

-- ---------------------------------------------------------------------
-- 5. VISTAS BASE (punto de partida para iterar)
-- ---------------------------------------------------------------------
-- Línea homologada: cuenta de grupo (null = sin mapeo → V03)
create or replace view v_linea_mapeada as
select l.*, c.estado as estado_carga, c.tipo_archivo, c.escenario_id,
       e.pais, e.moneda_funcional, m.cuenta_grupo_id,
       cg.tipo as tipo_cuenta, cg.rubro, coalesce(cg.es_ic, false) as es_ic
from linea_carga l
join carga c on c.carga_id = l.carga_id
join empresa e on e.empresa_id = c.empresa_id
left join mapeo_cuenta m on m.pais = e.pais and m.cuenta_local = l.cuenta_local
left join cuenta_grupo cg on cg.cuenta_grupo_id = m.cuenta_grupo_id;

-- Conversión a USD con la tasa ÚNICA del grupo y la moneda FUNCIONAL (nunca la declarada en el archivo)
create or replace view v_linea_usd as
select v.*, t.tipo_tasa, t.tasa_a_usd as tasa, round(v.monto * t.tasa_a_usd, 2) as usd
from (select *, case when tipo_archivo = 'PYG' then 'PRESUPUESTO'
                     when cuenta_grupo_id = '3100' then 'HISTORICA'
                     else 'CIERRE' end as tipo_tasa_req
      from v_linea_mapeada) v
left join tasa_grupo t on t.escenario_id = v.escenario_id and t.periodo = v.periodo
                      and t.moneda_id = v.moneda_funcional and t.tipo_tasa = v.tipo_tasa_req;

-- Agregado (todavía CUENTA DOBLE): solo cargas aprobadas
create or replace view v_agregado as
select escenario_id, cuenta_grupo_id, round(sum(usd), 2) as agregado
from v_linea_usd where estado_carga = 'APROBADA' and cuenta_grupo_id is not null
group by escenario_id, cuenta_grupo_id;

-- Pareo de documentos IC (pata emisor = ING/ACT, pata receptor = GAS/PAS)
create or replace view v_ic_pares as
with ic as (select * from v_linea_usd where es_ic and doc_ic_id is not null and estado_carga = 'APROBADA')
select coalesce(a.escenario_id, b.escenario_id) as escenario_id,
       coalesce(a.doc_ic_id, b.doc_ic_id) as doc_ic_id,
       coalesce(a.tipo_archivo, b.tipo_archivo) as estado_financiero,
       coalesce(a.empresa, b.socio_ic) as emisor, coalesce(b.empresa, a.socio_ic) as receptor,
       a.linea_id as linea_emisor, b.linea_id as linea_receptor,
       a.monto_tx as monto_tx_emisor, b.monto_tx as monto_tx_receptor,
       a.periodo as periodo_emisor, b.periodo as periodo_receptor,
       a.usd as usd_emisor, b.usd as usd_receptor, a.usd - b.usd as diferencia_usd
from (select * from ic where tipo_cuenta in ('ING','ACT')) a
full join (select * from ic where tipo_cuenta in ('GAS','PAS')) b
  on a.escenario_id = b.escenario_id and a.doc_ic_id = b.doc_ic_id and a.tipo_archivo = b.tipo_archivo;

-- Matriz IC: cuánto le facturó cada empresa a cada otra (USD, P&L)
create or replace view v_matriz_ic_facturado as
select escenario_id, empresa as emisor, socio_ic as receptor, round(sum(usd), 2) as facturado_usd
from v_linea_usd
where es_ic and tipo_cuenta = 'ING' and tipo_archivo = 'PYG' and estado_carga = 'APROBADA'
group by 1, 2, 3;

-- Saldos IC al cierre (+ me deben / − les debo)
create or replace view v_matriz_ic_saldos as
select escenario_id, empresa, socio_ic,
       round(sum(case when tipo_cuenta = 'ACT' then usd else -usd end), 2) as saldo_usd
from v_linea_usd
where es_ic and tipo_archivo = 'BALANCE' and estado_carga = 'APROBADA'
group by 1, 2, 3;

-- KPIs calculados desde una corrida (nunca capturados)
create or replace view v_kpi_grupo as
with c as (
  select k.corrida_id, cg.rubro, cg.tipo, k.cuenta_grupo_id, k.consolidado,
         k.consolidado * case cg.tipo when 'ING' then 1 when 'GAS' then -1 when 'ACT' then 1 else -1 end as neto
  from consolidado k join cuenta_grupo cg using (cuenta_grupo_id)
), b as (
  select corrida_id,
    sum(neto) filter (where rubro in ('VENTAS','OTROS_ING_OP','COSTO','GASTO_OP')) as ebit,
    sum(neto) filter (where rubro = 'CTO') as cto,
    sum(neto) filter (where rubro = 'AF')  as af,
    sum(consolidado) filter (where tipo = 'ACT') as activo_total,
    sum(consolidado) filter (where cuenta_grupo_id in ('2100','2150')) as pasivo_corriente
  from c group by corrida_id
)
-- Base auditable de KPIs. ROIC y EVA se completan en la iteración: NOPAT = ebit*(1-t) con t = ISR efectiva
-- ponderada por EBIT de cada empresa, y EVA = NOPAT - parametro.WACC * capital_invertido (ver resultados esperados)
select b.*, cto + af as capital_invertido, activo_total - pasivo_corriente as capital_empleado,
       ebit / nullif(activo_total - pasivo_corriente, 0) as roce
from b;
