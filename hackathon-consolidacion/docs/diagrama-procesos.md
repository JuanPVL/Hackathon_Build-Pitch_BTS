# Diagrama de procesos

Cómo se mueve la información en la base de `supabase/01_schema.sql`: quién hace cada paso, qué tabla toca y qué regla
de la base lo protege. Los estados y transiciones salen del catálogo `"status"` / `"statusTransition"`.

## 1. Proceso de punta a punta

```mermaid
flowchart TD
  subgraph EMP["Empresa (COMPANY_ACCOUNTANT)"]
    A1[Sube archivo PYG o BALANCE] --> A2["dataLoad RECIBIDA<br/>+ dataLoadLine (archivo#filaN)"]
    I1[Emite documento IC] --> I2["icDocument EMITIDA"]
    I5{Receptor revisa}
  end

  subgraph VAL["Validador V01–V20"]
    V1[Valida cada línea contra maestros,<br/>tasas, mapeo y contrapartes] --> V2["validationFinding<br/>(regla, severidad, impactoUsd)"]
    V2 --> V3{¿Severidad?}
  end

  subgraph CTRL["Controller de grupo (GROUP_CONTROLLER)"]
    C1{¿Aprueba con<br/>justificación?}
    C2[Lanza corrida de consolidación]
    C3[Cierra escenario]
  end

  subgraph DB["Base de datos (triggers, mismo commit)"]
    T1["Versión automática<br/>(advisory lock)"]
    T2["Crea icReceivable (emisor)<br/>+ icPayable espejo (receptor)<br/>→ PENDIENTE_ACEPTACION"]
    T3["Versión aprobada anterior<br/>→ REEMPLAZADA"]
    T4["Snapshot de parámetros<br/>+ hash de tasas"]
    T5[("audit.changeLog<br/>cada cambio")]
  end

  subgraph MOT["Motor de consolidación"]
    M1["Mapeo local → groupAccount<br/>(vMappedLine)"] --> M2["Conversión USD con tasa única<br/>y moneda funcional (vLineUsd)"]
    M2 --> M3["Agregado (vAggregate)<br/>cuenta doble el IC"]
    M2 --> M4["Pareo IC por icDocumentId<br/>(vIcPair) → icReconciliation"]
    M4 --> M5["Elimina solo lo conciliado<br/>E1 E2 E3 E4 E7 → elimination"]
    M3 --> M6["consolidatedBalance<br/>agregado + eliminaciones + CTA"]
    M5 --> M6
    M6 --> M7["lineage: Σ aportes = consolidado<br/>→ lineageOk"]
    M7 --> M8["KPIs (vKpi): EBIT, NOPAT, ROIC,<br/>ROCE, EVA por grupo y empresa"]
    M8 --> M9["Explicador V1 → V2<br/>varianceBridge: efecto × empresa<br/>× cuenta × periodo + bridge de EVA"]
  end

  A2 --> T1
  A2 --> V1
  V3 -- "B bloqueante" --> Q["dataLoad CUARENTENA<br/>(corrige y sube nueva versión)"]
  Q -.-> A1
  V3 -- "A advertencia" --> P[dataLoad PENDIENTE_APROBACION] --> C1
  V3 -- "sin hallazgos" --> AP[dataLoad APROBADA]
  C1 -- sí --> AP
  C1 -- no --> Q
  AP --> T3
  I2 --> T2 --> I5
  I5 -- acepta --> I3[icDocument ACEPTADA]
  I5 -- disputa con motivo --> I4[icDocument DISPUTADA]
  I4 -.->|nueva versión o anulación| I1
  AP --> C2
  C2 --> T4 --> M1
  M9 --> C3
  A2 & AP & I2 & I3 & C2 & C3 -.-> T5
```

## 2. Ciclo de un documento intercompany

```mermaid
sequenceDiagram
  autonumber
  actor E as Emisor (vende / presta)
  participant DB as Base de datos
  actor R as Receptor (compra / recibe)
  actor G as Controller de grupo

  E->>DB: insert icDocument (BORRADOR, solo visible al emisor)
  E->>DB: update statusCode = EMITIDA
  activate DB
  DB->>DB: fnIcDocumentMirror crea icReceivable (emisor)<br/>e icPayable espejo (receptor) en la misma transacción
  DB->>DB: icDocument → PENDIENTE_ACEPTACION, montos y partes congelados
  deactivate DB
  DB-->>R: el documento y su CxP aparecen por RLS
  alt Receptor acepta
    R->>DB: fnAcceptIcDocument(icDocumentId, version)
    DB->>DB: icPayable.acceptedBy/acceptedAt, icDocument → ACEPTADA
  else Receptor disputa
    R->>DB: fnDisputeIcDocument(icDocumentId, version, motivo)
    DB->>DB: icDocument → DISPUTADA (statusReason obligatorio)
    E->>DB: nueva versión del documento o ANULADA con motivo
  end
  G->>DB: corrida de consolidación concilia por icDocumentId
  DB->>DB: icReconciliation CONCILIADO / CONCILIADO_FX → icDocument CONCILIADA
  DB->>DB: elimination (E1 ventas/servicios, E2 saldos, E3 préstamo, E4 intereses, E7 dif. FX)
  Note over DB: El emisor no puede aceptar su propio documento.<br/>Un documento emitido nunca se borra: se anula o se emite nota de crédito.
```

## 3. Corrida de consolidación

```mermaid
flowchart LR
  S0["scenario ABIERTO<br/>(FOR SHARE)"] --> S1["insert consolidationRun<br/>parameterSnapshot + ratesHash"]
  S1 --> S2["consolidationRunLoad<br/>solo cargas isConsolidable (APROBADA)<br/>del mismo escenario"]
  S2 --> S3["icReconciliation<br/>N1 CONCILIADO · N2 CONCILIADO_FX · FX_FUERA_TOLERANCIA<br/>N3 DIFERENCIA_MONTO · N4 SIN_CONTRAPARTE<br/>N5 DIFERENCIA_CORTE · N6 SALDO_NO_CUADRA"]
  S3 --> S4["elimination<br/>solo si el estado tiene allowsElimination<br/>companyId nulo = asiento de grupo (E7, CTA)"]
  S4 --> S5["consolidatedBalance<br/>consolidatedUsd = columna generada"]
  S5 --> S6["lineage<br/>Σ contributionUsd = consolidatedUsd ± 1"]
  S6 --> S7["update lineageOk (una sola vez)"]
  S7 --> S8["Resultados inmutables:<br/>UPDATE rechazado por trigger"]
```

## 3b. Explicador de desviaciones

```mermaid
flowchart LR
  R1["Corrida antes<br/>(PPTO_V1 corregida)"] --> B0["varianceBridge<br/>fromRunId → toRunId"]
  R2["Corrida después<br/>(PPTO_V2)"] --> B0
  B0 --> B1["varianceBridgeLine<br/>Volumen · Precio · Tipo de cambio<br/>Costo · Gasto · IC neutral<br/>por empresa, cuenta y periodo"]
  B0 --> B2["varianceBridgeEva<br/>EBIT después de impuestos · Tasa efectiva<br/>WACC · Capital invertido"]
  B1 --> C["vVarianceBridgeCheck<br/>Σ efectos = ΔVentas y ΔEBIT de vKpi"]
  B2 --> C
  C --> D["Director: qué cambió, dónde y por qué<br/>y cada línea baja a vLineageDetail"]
```

## 4. Máquinas de estado (`"statusTransition"`)

Transiciones marcadas con **motivo** exigen `statusReason` no vacío. Cualquier otra transición la rechaza
`fnEnforceStatusTransition`.

### Carga (`"dataLoad"`, dominio LOAD)

```mermaid
stateDiagram-v2
  [*] --> RECIBIDA : subida (versión automática)
  RECIBIDA --> CUARENTENA : hallazgo bloqueante
  RECIBIDA --> PENDIENTE_APROBACION : solo advertencias
  RECIBIDA --> APROBADA : sin hallazgos
  RECIBIDA --> REEMPLAZADA
  CUARENTENA --> RECIBIDA : revalidar
  CUARENTENA --> REEMPLAZADA : nueva versión
  PENDIENTE_APROBACION --> APROBADA : motivo (justificación)
  PENDIENTE_APROBACION --> CUARENTENA
  PENDIENTE_APROBACION --> REEMPLAZADA
  APROBADA --> REEMPLAZADA : se aprueba otra versión (automático)
  REEMPLAZADA --> [*]
  note right of APROBADA
    Solo una APROBADA por empresa + escenario + estado financiero.
    Nunca con hallazgos B. Líneas congeladas.
  end note
```

### Documento IC (`"icDocument"`, dominio IC_DOCUMENT)

```mermaid
stateDiagram-v2
  [*] --> BORRADOR
  [*] --> EMITIDA
  BORRADOR --> EMITIDA
  BORRADOR --> ANULADA : motivo
  EMITIDA --> PENDIENTE_ACEPTACION : automático, nacen CxC + CxP
  PENDIENTE_ACEPTACION --> ACEPTADA : receptor
  PENDIENTE_ACEPTACION --> DISPUTADA : motivo
  DISPUTADA --> PENDIENTE_ACEPTACION : motivo
  DISPUTADA --> ANULADA : motivo
  ACEPTADA --> CONCILIADA : corrida
  ACEPTADA --> ANULADA : motivo
  CONCILIADA --> COMPENSADA
  COMPENSADA --> [*]
  ANULADA --> [*]
  note right of PENDIENTE_ACEPTACION
    BORRADOR, EMITIDA, PENDIENTE_ACEPTACION y DISPUTADA
    impiden cerrar el escenario sin motivo.
  end note
```

### Escenario (`"scenario"`, dominio SCENARIO)

```mermaid
stateDiagram-v2
  [*] --> ABIERTO
  ABIERTO --> CERRADO : motivo si hay IC pendiente o disputado
  CERRADO --> ABIERTO : motivo (reapertura)
  note right of CERRADO
    Escenario cerrado = solo lectura para tasas,
    parámetros, cargas y documentos IC.
  end note
```

## 5. Quién puede hacer qué (RLS, `05_security_rls.sql`)

| Rol | Ve | Escribe | Aprueba cargas | Maestros |
|---|---|---|---|---|
| `GROUP_CONTROLLER` | Todo el grupo, corridas, auditoría | Todo | Sí | Sí |
| `AUDITOR` | Todo el grupo, corridas, auditoría | Nada | No | No |
| `COMPANY_ACCOUNTANT` | Su empresa, sus IC (emitidos y recibidos), su CxC/CxP | Cargas y documentos IC de su empresa | No | No |
| `COMPANY_VIEWER` | Su empresa | Nada | No | No |
| `anon` | Nada | Nada | No | No |

Los borradores IC solo los ve el emisor. `service_role` (backend, SQL Editor) no pasa por RLS.
