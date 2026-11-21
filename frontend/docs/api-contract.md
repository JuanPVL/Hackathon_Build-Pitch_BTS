# Contrato de API propuesto (pendiente de confirmar con NestJS)

> **Aviso.** Este documento es una **propuesta** del frontend de QUADRA. Se deriva de los tipos de dominio (`src/features/*/domain/types.ts`), de los adaptadores HTTP (`src/features/*/adapters/Http*Repository.ts`) y del manejo de errores de `src/shared/api/httpClient.ts`. Se ajusta a los mockups de cada pantalla.
>
> - **Ninguna ruta está implementada.** El backend NestJS todavía no existe.
> - Las rutas de los adaptadores empiezan en `/scenarios/...`, `/ic/...`, `/validation/...` o `/variance-bridge`. El backend las publica con el prefijo **`/api`**, por ejemplo `GET /api/scenarios/{scenarioId}/consolidation`.
> - Formato: JSON en request y response. Sin envoltorio: el cuerpo de respuesta es el objeto o arreglo del tipo indicado.
> - El frontend envía `Authorization: Bearer <JWT de Supabase>` en cada llamada.
> - **El backend debe validar** firma, audiencia (`aud`), expiración (`exp`) y permisos del usuario. Los datos deben filtrarse por empresa mediante RLS. Las vistas de la base usan `security_invoker = true`, así que la consulta debe ejecutarse con la identidad del usuario y no con una credencial de servicio que salte RLS.
> - **Montos** en número (JSON `number`). Son USD salvo que el campo indique otra moneda (por ejemplo `Money`).
> - **Ratios** como proporción: `0.1195` equivale a `11.95 %`. El frontend es quien da formato.
> - Los puntos marcados como **"Por confirmar"** son decisiones abiertas que deben cerrarse con el equipo de NestJS.

---

## 1. Convenciones

### 1.1 Identificadores y parámetros compartidos

| Concepto | Tipo TS | Valores / formato | Notas |
|---|---|---|---|
| `scenarioId` | `string` (en `ScenarioQuery`) | `PPTO_V1`, `PPTO_V2` | Corresponde a `scenario."scenarioId"`. Si no existe, responder 404. |
| `CompanyCode` | `'GT1' \| 'GT2' \| 'MX1' \| 'MX2' \| 'US1' \| 'US2'` | Empresas del grupo | Coinciden con los códigos de empresa de la base. En el frontend: GT1 Alfa Guatemala, GT2 Beta Guatemala, MX1 Alfa México, MX2 Gamma México, US1 Alfa USA, US2 Delta Holding USA. |
| `CurrencyCode` | `'GTQ' \| 'MXN' \| 'USD'` | Monedas del grupo | Parámetro `currency`. Hoy el frontend siempre envía `USD`. **Por confirmar:** qué responde el backend si llega otra moneda (propuesta: 400 mientras no esté implementada). |
| `IcDocumentKey` | `string` | Ejemplo del JSDoc: `IC-F1-2027-12` | Llave de conciliación del documento intercompany. |
| `Money` | `{ currency: CurrencyCode; amount: number }` | Monto en la moneda de la factura | Montos en la moneda original. |

`ScenarioQuery` (`src/entities/index.ts`) agrupa `scenarioId` y `currency`. El campo `currency` solo se envía en algunas rutas (ver tabla de resumen).

### 1.2 Formato de fechas y precisión

- Fechas y horas: texto ISO 8601 en UTC (por ejemplo `2027-12-31T23:59:00Z`). Propuesta, no hay ejemplo en los tipos.
- Montos USD: hasta 2 decimales (en la base son `numeric(20,2)`).
- Tasas (`rateToUsd`) y ratios: hasta 10 decimales en la base (`numeric(20,10)` en tasas). Se recomienda devolver al menos 4 decimales en ratios.

### 1.3 Errores

El frontend (`httpClient.ts`) interpreta cualquier respuesta no exitosa así:

- Lee el cuerpo JSON y toma `message`.
- Si `message` es un arreglo (típico de validaciones de NestJS con `class-validator`), lo une con `", "`.
- Si no hay `message` válido, muestra `Error del servidor (<status>)`.
- Lanza `ApiError(status, message)`.

**Formato propuesto del cuerpo de error:**

```json
{ "statusCode": 404, "message": "No existe el escenario PPTO_V9." }
```

o, en validaciones:

```json
{ "statusCode": 400, "message": ["view debe ser saldo, facturado o recibido"] }
```

Solo `message` (string o string[]) es obligatorio para el frontend. Los campos `statusCode` y `error` del formato por defecto de NestJS son compatibles.

**Tabla de códigos y comportamiento de la UI:**

| Código | Situación propuesta en el backend | Qué hace la UI |
|---|---|---|
| 200 / 201 | Operación correcta con cuerpo JSON. | Renderiza el tipo indicado en cada endpoint. |
| 204 | Operación correcta sin cuerpo. | Devuelve `undefined`. Es el caso de `accept-correction`. Ver nota en la sección 3.3. |
| 400 | Parámetro inválido (por ejemplo `view` o `metric` fuera de catálogo, o `from == to`). | Muestra el `message` tal cual. No hay tratamiento especial. |
| 401 | Falta el JWT, está vencido o no es válido. | `ApiError.isForbidden` es verdadero. La UI muestra **"sin permiso"**. |
| 403 | JWT válido, pero el usuario no tiene permiso sobre la empresa o el escenario (RLS). | `isForbidden`. La UI muestra **"sin permiso"**. |
| 404 | El escenario, el documento, el hallazgo o el par no existen. | `isNotFound`. La UI muestra **"sin datos"**. |
| 409 / 422 | Conflicto de negocio (por ejemplo, escenario cerrado o hallazgo bloqueante que no se puede aceptar). | No tiene tratamiento especial. Se muestra el `message`. **Propuesta:** usar 422 para reglas de negocio y 409 para estado incompatible. |
| 5xx | Error interno. | No hay tratamiento especial. Se muestra el `message` si existe; si no, `Error del servidor (5xx)`. **Propuesta:** no exponer detalles internos en `message` para 5xx. |
| Red (`status = 0`) | Sin conexión, CORS o servidor caído. | `isNetwork`. La UI muestra **"No se pudo conectar con el servidor."** |
| Timeout | Se agotan 30 s sin respuesta. | Se reporta como `status = 0` (mismo mensaje de red). |

**Nota de frontend (`httpClient.ts`):** el timeout de 30 s solo se aplica cuando el llamador no pasa `signal`. Si un hook pasa `AbortSignal`, la petición no tiene límite de tiempo. Revisar antes de integrar con NestJS.

### 1.4 Autorización

- Todas las rutas requieren JWT. Sin token, responder 401.
- El backend debe filtrar por empresa según el perfil del usuario (RLS). Un usuario sin acceso a una empresa no debe ver sus filas, ni siquiera en matrices o totales. **Por confirmar:** si el 403 se usa cuando el escenario existe pero el usuario no tiene acceso, y el 404 cuando no existe (o para no revelar su existencia).

### 1.5 Enumeraciones (catálogos)

| Enumeración | Valores | Fuente TS |
|---|---|---|
| `PipelineStepCode` | `VALIDAR`, `CONCILIAR`, `CONVERTIR`, `ELIMINAR`, `EXPLICAR` | consolidation |
| `KpiCode` | `EBIT`, `ROIC`, `ROCE`, `EVA` | consolidation |
| `MatrixView` | `saldo`, `facturado`, `recibido` | current-account |
| `ProfitabilityView` | `consolidado`, `sin-eliminar` | profitability |
| `IcType` | `VENTA`, `GESTION`, `PRESTAMO`, `INTERES` | reconciliation |
| `ReconciliationResult` | `CONCILIADO`, `CONCILIADO_FX`, `DIFERENCIA_MONTO`, `DIFERENCIA_CORTE`, `SIN_CONTRAPARTE`, `FX_FUERA_TOLERANCIA` | reconciliation |
| `DocumentStatus` | `BORRADOR`, `EMITIDA`, `PENDIENTE_ACEPTACION`, `ACEPTADA`, `DISPUTADA`, `CONCILIADA`, `COMPENSADA`, `ANULADA` | ic-document |
| `LoadStatus` | `RECIBIDA`, `CUARENTENA`, `PENDIENTE_APROBACION`, `APROBADA`, `REEMPLAZADA` | entities |
| `Severity` | `B` (bloqueante), `A` (advertencia, requiere justificación), `I` (informativa) | validation |
| `EliminationRule` | `E1` a `E7` | eliminations |
| `EffectCode` | `VOLUMEN`, `PRECIO`, `COSTO`, `TIPO_CAMBIO`, `PERIMETRO_IC`, `CORRECCION_CARGA`, `PARAMETRO`, `RESIDUAL` | variance |
| `BridgeMetric` | `EBIT`, `VENTAS`, `EVA` | variance |
| `MatrixCell.status` | `EXACTO`, `FX`, `DIFERENCIA`, `SIN_SALDO` | current-account |
| `RateRow` tipo de tasa (`RateType`) | `PRESUPUESTO`, `PROMEDIO`, `CIERRE`, `HISTORICA` | rates |
| `RateAlert.severity` | `BLOQUEANTE`, `INFO` | rates |
| `RatesTable.status` | `VIGENTE`, `BORRADOR` | rates |
| `LineageNode.kind` | `CIFRA`, `DOCUMENTO`, `LINEA_CARGA` | ic-document |

---

## 2. Endpoints por módulo

Cada sección indica: método y ruta, query params, pantalla que lo usa, campos de respuesta, y la vista o tabla de Supabase (`../hackathon-consolidacion/supabase/01_schema.sql`) que probablemente lo alimenta. Cuando no hay coincidencia clara por nombre, se escribe "Por definir".

> **Nota sobre el conteo.** Hay **11 métodos** en los 9 adaptadores, no 10. `HttpValidationRepository` y `HttpCurrentAccountRepository` tienen dos métodos cada uno. Todos quedan documentados.

---

### 2.1 Presupuesto consolidado

**`GET /api/scenarios/{scenarioId}/consolidation?currency=USD`**
Repositorio: `ConsolidationRepository.getSummary` (`HttpConsolidationRepository`).
Pantalla: **Presupuesto consolidado** (`/`, `ConsolidationPage`).

| Query | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `currency` | `CurrencyCode` | Sí (hoy siempre `USD`) | Moneda de presentación. |

Respuesta: `ConsolidationSummary`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `runId` | `string` | Identificador de la corrida de consolidación que produce estas cifras. |
| `generatedAt` | `string` | Fecha y hora de generación (ISO 8601). |
| `lineageOk` | `boolean` | Si la suma del linaje coincide con el consolidado. |
| `lineage` | `{ accountsOk: number; accountsTotal: number }` | Cuentas cuyo linaje cuadra, sobre el total de cuentas. |
| `steps` | `PipelineStepStatus[]` | Estado de cada paso del pipeline. |
| `sales` | `{ aggregate: number; eliminations: number; consolidated: number; icDocuments: number }` | Ventas en USD: agregadas, eliminadas, consolidadas, y cantidad de documentos IC. El campo `icDocuments` se deduce del nombre (cantidad). |
| `fxDifferenceIc` | `number` | Diferencia cambiaria de las transacciones IC, en USD. Deducido del nombre. |
| `kpis` | `KpiValue[]` | KPIs del grupo (EBIT, ROIC, ROCE, EVA). |
| `incomeStatement` | `AccountLine[]` | Estado de resultados por cuenta. |
| `balanceSheet` | `AccountLine[]` | Balance general por cuenta. |
| `evaByCompany` | `{ company: CompanyCode; name: string; eva: number }[]` | EVA por empresa, en USD. |

Tipos anidados:

`PipelineStepStatus`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `code` | `PipelineStepCode` | Paso del pipeline. |
| `closed` | `boolean` | Si el paso está cerrado. |
| `caption` | `string` | Texto de estado para la UI. |

`KpiValue`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `code` | `KpiCode` | `EBIT`, `ROIC`, `ROCE` o `EVA`. |
| `value` | `number` | USD para EBIT y EVA; proporción (`0.1195`) para ROIC y ROCE. |
| `unit` | `'USD' \| 'RATIO'` | Unidad de `value`. |
| `withoutElimination` | `number` | Mismo KPI sin eliminar intercompany, para comparar. Misma unidad que `value`. |
| `formula` | `string` | Fórmula en texto, para mostrar al usuario. |

`AccountLine`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `account` | `string` | Código de cuenta del grupo. |
| `name` | `string` | Nombre de la cuenta. |
| `aggregate` | `number` | Suma simple de las cargas aprobadas, en USD. Incluye doble conteo intercompany. |
| `elimination` | `number` | Efecto de las eliminaciones, en USD. |
| `consolidated` | `number` | Resultado consolidado, en USD. |
| `isIntercompany` | `boolean` | Si la cuenta es intercompany. |

**Vista/tabla Supabase probable:**
- `kpis`: `vGroupKpi` (basis `CONSOLIDADO` y `AGREGADO`). Coincidencia clara por nombre.
- `lineageOk`: `consolidationRun."lineageOk"`.
- `runId`, `generatedAt`: `consolidationRun."runId"`, `consolidationRun."executedAt"`.
- `incomeStatement`, `balanceSheet`, `aggregate`, `elimination`, `consolidated`: `consolidatedBalance` (`aggregatedUsd`, `eliminationsUsd`, `consolidatedUsd`), con el nombre de la cuenta en `groupAccount`.
- `evaByCompany`: `vCompanyKpi` (`evaUsd`).
- `steps`, `lineage`, `sales`, `fxDifferenceIc`: Por definir.

---

### 2.2 Carga y validación

**`GET /api/scenarios/{scenarioId}/validation`**
Repositorio: `ValidationRepository.getReport` (`HttpValidationRepository`).
Pantallas: **Carga y validación** (`/validacion`). Además, `PublicationStatus` lo usa en la cabecera (`AppShell`), por lo que se consulta en casi todas las pantallas.

Sin query params.

Respuesta: `ValidationReport`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `publishable` | `boolean` | Si el escenario puede publicarse (sin hallazgos bloqueantes). Propuesta: que lo calcule el backend y no la UI. |
| `loads` | `LoadSummary[]` | Estado de las cargas por empresa y moneda. |
| `totals` | `{ blocking: number; warnings: number; info: number }` | Conteo de hallazgos por severidad. |
| `findings` | `Finding[]` | Hallazgos ordenados por `impactUsd` descendente (regla del validador). |

`LoadSummary`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `owner` | `string` | Empresa (`GT1`…) o `TASAS` para la tabla de tasas del grupo. |
| `currency` | `CurrencyCode \| 'GRUPO'` | Moneda de la empresa, o `GRUPO` para tasas. |
| `budget` | `LoadStatus \| null` | Estado de la carga de presupuesto. `null` si no hay carga. |
| `balance` | `LoadStatus \| null` | Estado de la carga de saldos. `null` si no hay carga. |
| `findings` | `number` | Cantidad de hallazgos de esta carga. |

`Finding`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `id` | `string` | Identificador del hallazgo. Se usa en `accept-correction`. |
| `rule` | `string` | Código de regla del validador, por ejemplo `V08`. |
| `severity` | `'B' \| 'A' \| 'I'` | Bloqueante, advertencia o informativa. |
| `scope` | `string` | Empresa, par de empresas (`US2→MX2`) o moneda (`MXN`). |
| `record` | `string` | Ancla de linaje, por ejemplo `presupuesto_US1_V1.csv#fila46`. |
| `message` | `string` | Mensaje para el usuario. |
| `found` | `string` (opcional) | Valor encontrado. |
| `expected` | `string` (opcional) | Valor esperado. |
| `suggestion` | `string` (opcional) | Corrección sugerida. |
| `impactUsd` | `number` | Impacto estimado en USD. Se usa para ordenar. |

**Vista/tabla Supabase probable:**
- `findings`: `validationFinding` (`findingId` → `id`, `ruleCode` → `rule`, `severityCode` → `severity`, `recordRef` → `record`, `message`, `foundValue` → `found`, `expectedValue` → `expected`, `suggestion`, `impactUsd`). `companyCode` alimenta `scope`. Coincidencia clara.
- `totals`: derivado de `validationFinding` y `severity`.
- `loads`: `dataLoad` (`statusCode`, por empresa, escenario y estado financiero). Por confirmar cómo se mapea `budget` y `balance` a `financialStatementCode`.
- `rule`: `validationRule` (`ruleCode`, `severityCode`).
- `publishable`: Por definir (regla de negocio sobre los hallazgos `B`).

**Nota de tipo:** en la base, `validationFinding."findingId"` es `bigint`. Devolverlo como string en JSON (propuesta), para que coincida con el tipo `string` del frontend.

---

**`POST /api/validation/findings/{findingId}/accept-correction`**
Repositorio: `ValidationRepository.acceptCorrection` (`HttpValidationRepository`).
Pantalla: **Carga y validación** (aceptar una corrección o advertencia con justificación).

Path: `findingId` (`string`).

Body:

```json
{ "justification": "Texto con el motivo de la aceptación." }
```

| Campo del body | Tipo | Descripción |
|---|---|---|
| `justification` | `string` | Justificación obligatoria. Propuesta: no vacía y con longitud mínima definida por el equipo. |

Respuesta: `void` (sin cuerpo). **Propuesta:** responder **204 No Content**. Ver nota de abajo.

**Propuesta de reglas:** solo los hallazgos de severidad `A` se pueden aceptar con justificación. Un hallazgo `B` debe responder 422. Un hallazgo de un escenario cerrado debe responder 409. **Por confirmar.**

**Vista/tabla Supabase probable:**
- Hallazgo: `validationFinding` (`findingId`).
- Justificación y quién aceptó: Por definir. `validationFinding` no tiene columna de justificación. Propuesta: registrar en `audit."changeLog"` (existe en el esquema) o agregar columnas.

**Nota de frontend:** `httpClient` hace `response.json()` en cualquier respuesta distinta de 204. Si el backend responde 200 con cuerpo vacío, la llamada falla. Por eso se recomienda 204.

---

### 2.3 Conciliación intercompany

**`GET /api/scenarios/{scenarioId}/ic/reconciliation?type=&period=`**
Repositorio: `ReconciliationRepository.getReport` (`HttpReconciliationRepository`).
Pantalla: **Conciliación** (`/conciliacion`).

| Query | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `type` | `IcType` (opcional) | No | Filtra por tipo: `VENTA`, `GESTION`, `PRESTAMO`, `INTERES`. El frontend lo omite si no hay filtro. |
| `period` | `string` (opcional) | No | Periodo. El formato no está en los tipos. Propuesta: `YYYY-MM`, deducido del ejemplo `IC-F1-2027-12`. **Por confirmar.** |

Respuesta: `ReconciliationReport`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `totals` | `{ documents: number; reconciled: number; exact: number; fx: number; pending: number }` | Conteos de documentos por resultado. |
| `tolerance` | `{ usd: number; pct: number }` | Tolerancia de conciliación. `usd` en USD. `pct`: **por confirmar** si es proporción (`0.01` = 1 %) o porcentaje (`1` = 1 %). Ver sección 3. |
| `pairs` | `IcPair[]` | Pares de documentos conciliados o pendientes. |
| `byResult` | `{ result: ReconciliationResult; count: number }[]` | Conteo por tipo de resultado. |

`IcPair`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `key` | `IcDocumentKey` | Llave del documento, por ejemplo `IC-F1-2027-12`. |
| `type` | `IcType` | Tipo de transacción intercompany. |
| `issuer` | `CompanyCode` | Empresa emisora. |
| `receiver` | `CompanyCode` | Empresa receptora. |
| `agreed` | `Money` | Monto pactado en la moneda de la factura. |
| `issuerUsd` | `number` | Monto reportado por el emisor, en USD. |
| `receiverUsd` | `number` | Monto reportado por el receptor, en USD. |
| `differenceUsd` | `number` | Diferencia en USD (emisor menos receptor). |
| `result` | `ReconciliationResult` | Resultado de la conciliación del par. |

**Vista/tabla Supabase probable:**
- `pairs`: `vIcPair` (`icDocumentId` → `key`, `issuerCompanyId` → `issuer`, `receiverCompanyId` → `receiver`, `issuerUsd`, `receiverUsd`, `differenceUsd`). Coincidencia clara. Se complementa con `icReconciliation` (`statusCode`, por documento y estado financiero).
- `agreed`: `icDocument` (`transactionAmount`, `transactionCurrencyCode`).
- `type`: `icDocument."icDocumentTypeCode"`.
- `result`: `icReconciliation."statusCode"`. Por confirmar la correspondencia entre `status` del dominio `RECONCILIATION` y `ReconciliationResult`.
- `totals`, `byResult`, `tolerance`: Por definir.

---

### 2.4 Cuenta corriente intercompany (matriz)

**`GET /api/scenarios/{scenarioId}/ic/balances?view=&currency=`**
Repositorio: `CurrentAccountRepository.getMatrix` (`HttpCurrentAccountRepository`).
Pantalla: **Cuenta corriente** (`/cuenta-corriente`).

| Query | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `view` | `MatrixView` | Sí | `saldo` (saldos al cierre), `facturado` (facturación IC) o `recibido` (lo recibido). |
| `currency` | `CurrencyCode` | Sí (hoy `USD`) | Moneda de presentación. |

Respuesta: `BalanceMatrix`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `view` | `MatrixView` | Vista consultada, eco del parámetro. |
| `companies` | `CompanyCode[]` | Empresas que aparecen en filas y columnas. |
| `cells` | `MatrixCell[]` | Celdas de la matriz. La fila es la empresa que reporta. |
| `totals` | `{ documents: number; exact: number; fx: number; orphan: number; disputed: number }` | Conteos de documentos por estado de conciliación. |

`MatrixCell`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `company` | `CompanyCode` | Empresa que reporta (fila). |
| `counterparty` | `CompanyCode` | Contraparte (columna). |
| `balanceUsd` | `number` | Saldo en USD. Positivo = me deben; negativo = les debo. En las vistas `facturado` y `recibido` el campo lleva el monto facturado o recibido. **Por confirmar** el nombre del campo para esas vistas. |
| `status` | `'EXACTO' \| 'FX' \| 'DIFERENCIA' \| 'SIN_SALDO'` | Estado de conciliación de la celda. |

**Vista/tabla Supabase probable:**
- `view=saldo`: `vIcBalanceMatrix` (`companyId` → `company`, `partnerCompanyId` → `counterparty`, `balanceUsd`). Coincidencia clara.
- `view=facturado`: `vIcBilledMatrix` (`issuerCompanyId`, `receiverCompanyId`, `billedUsd`). El campo de la base es `billedUsd`, no `balanceUsd`.
- `view=recibido`: Por definir. Probablemente `vIcBilledMatrix` con filas y columnas invertidas. **Por confirmar.**
- `status`: Por definir. Derivado de `icReconciliation`.
- `totals`: Por definir.

---

**`GET /api/scenarios/{scenarioId}/ic/balances/{company}/{counterparty}`**
Repositorio: `CurrentAccountRepository.getPair` (`HttpCurrentAccountRepository`).
Pantalla: **Cuenta corriente**, detalle de un par (al abrir una celda de la matriz).

Path: `company` (`CompanyCode`), `counterparty` (`CompanyCode`). Deben ser distintos.
Sin query params. El frontend no envía `currency`.

Respuesta: `PairDetail`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `company` | `CompanyCode` | Empresa que reporta. |
| `counterparty` | `CompanyCode` | Contraparte. |
| `description` | `string` | Descripción del par para la UI. Por definir cómo se genera. |
| `balanceUsd` | `number` | Saldo del par en USD (la empresa frente a la contraparte). |
| `mirrorBalanceUsd` | `number` | Saldo espejo: lo que reporta la contraparte, en USD. Deducido del nombre. |
| `fxDifferenceUsd` | `number` | Diferencia cambiaria del par, en USD. |
| `documents` | `PairDocument[]` | Documentos del par. |

`PairDocument`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `key` | `IcDocumentKey` | Llave del documento. |
| `agreed` | `Money` | Monto pactado en la moneda de la factura. |
| `result` | `ReconciliationResult` | Resultado de conciliación del documento. |

**Vista/tabla Supabase probable:**
- `balanceUsd`, `mirrorBalanceUsd`: `vIcBalanceMatrix` (la fila del par y la fila inversa).
- `documents`: `vIcPair` y `icDocument` (`icDocumentId`, `transactionAmount`, `transactionCurrencyCode`).
- `result`: `icReconciliation."statusCode"`.
- `description`, `fxDifferenceUsd`: Por definir.

---

### 2.5 Documento intercompany y linaje

**`GET /api/ic/documents/{key}?scenario={scenarioId}`**
Repositorio: `IcDocumentRepository.getDocument` (`HttpIcDocumentRepository`).
Pantalla: **Documento y linaje** (`/documentos/:key`). Oculta en el menú; se abre desde Conciliación o Cuenta corriente.

Path: `key` (`IcDocumentKey`, codificada en URL).

| Query | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `scenario` | `string` | Sí | `scenarioId`. **Inconsistencia:** el resto de rutas usan `scenarioId` en el path. **Por confirmar** si se unifica. |

Respuesta: `IcDocumentDetail`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `key` | `IcDocumentKey` | Llave del documento. |
| `version` | `number` | Versión del documento. Propuesta: si no se pide versión, devolver la vigente. |
| `type` | `IcType` | Tipo de transacción. |
| `issuer` | `CompanyCode` | Empresa emisora. |
| `receiver` | `CompanyCode` | Empresa receptora. |
| `status` | `DocumentStatus` | Estado actual del documento. |
| `result` | `ReconciliationResult` | Resultado de conciliación. |
| `receivable` | `DocumentLeg` | Pata de la cuenta por cobrar del emisor (CXC). |
| `payable` | `DocumentLeg` | Pata de la cuenta por pagar del receptor (CXP). |
| `lineage` | `LineageNode[]` | Nodos del linaje, desde la cifra hasta la fila del archivo. |
| `lineageOk` | `boolean` | Si el linaje del documento cuadra. |
| `lifecycle` | `{ status: DocumentStatus; label: string; reached: boolean; current: boolean }[]` | Ciclo de vida ordenado, con el estado alcanzado y el actual. |
| `events` | `DocumentEvent[]` | Bitácora de eventos del documento. |

`DocumentLeg`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `company` | `CompanyCode` | Empresa de la pata. |
| `role` | `'CXC' \| 'CXP'` | Cuenta por cobrar o por pagar. |
| `counterpartyLabel` | `string` | Etiqueta de la contraparte para la UI. |
| `amount` | `Money` | Monto en la moneda de la transacción. |
| `usd` | `number` | Monto en USD. |
| `conversionNote` | `string` | Texto de conversión: tasa usada y moneda funcional. |

`LineageNode`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `kind` | `'CIFRA' \| 'DOCUMENTO' \| 'LINEA_CARGA'` | Tipo de nodo. |
| `label` | `string` | Etiqueta del nodo. |
| `value` | `string` | Valor mostrado (texto). |
| `detail` | `string` | Detalle del nodo. |
| `origin` | `string` (opcional) | Origen si el nodo es una fila de archivo, por ejemplo `balance_GT1_V2.csv#fila8`. |

`DocumentEvent`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `event` | `string` | Nombre del evento. |
| `actor` | `string` | Quién realizó la acción. |
| `detail` | `string` | Detalle del evento. |
| `at` | `string` (opcional) | Fecha y hora del evento (ISO 8601). |

**Vista/tabla Supabase probable:**
- Datos base: `icDocument` (`icDocumentId` → `key`, `version`, `icDocumentTypeCode` → `type`, `issuerCompanyId` → `issuer`, `receiverCompanyId` → `receiver`, `statusCode` → `status`, `transactionAmount`, `transactionCurrencyCode`). Coincidencia clara.
- `receivable`: `icReceivable` (`companyId`, `currencyCode`, `amount`, `balance`). Coincidencia clara por nombre (cxc_ic).
- `payable`: `icPayable`. Coincidencia clara por nombre.
- `lineage`, `lineageOk`: `vLineageDetail` (`sourceId`, `fileName`, `lineId`, `localAmount`, `contributionUsd`) y `lineage`.
- `lifecycle`: `status` (`sortOrder`, `isInitial`, `isFinal`, dominio `IC_DOCUMENT`).
- `events`: Por definir. Propuesta: `audit."changeLog"`.
- `result`: Por definir. Ver `icReconciliation`.

---

### 2.6 Tasas del grupo

**`GET /api/scenarios/{scenarioId}/rates`**
Repositorio: `RatesRepository.getTable` (`HttpRatesRepository`).
Pantalla: **Tasas del grupo** (`/tasas`).

Sin query params. El frontend no envía `currency` aunque `ScenarioQuery` lo tiene.

Respuesta: `RatesTable`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `version` | `string` | Versión de la tabla de tasas. Deducido del nombre. Podría venir de `consolidationRun."ratesHash"`. **Por confirmar.** |
| `status` | `'VIGENTE' \| 'BORRADOR'` | Estado de la tabla. |
| `appliedTo` | `number` | Cantidad de cifras o cargas a las que se aplica la tabla. Deducido del nombre. **Por confirmar.** |
| `rows` | `RateRow[]` | Una fila por moneda del grupo. |
| `conversionRules` | `{ scope: string; rateType: RateType }[]` | Reglas de conversión: qué tipo de tasa se usa en cada alcance. |
| `ctaUsd` | `number` | Diferencia de conversión acumulada (CTA), en USD. |
| `controlBandPct` | `number` | Banda de control de variación de tasas. **Por confirmar** si es proporción o porcentaje. |
| `alerts` | `RateAlert[]` | Alertas sobre la tabla de tasas. |

`RateRow`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `currency` | `CurrencyCode` | Moneda. |
| `name` | `string` | Nombre de la moneda para la UI. |
| `companies` | `CompanyCode[]` | Empresas que usan esta moneda. |
| `budgetPrevious` | `number \| null` | Tasa del escenario anterior, para comparar. `null` si no aplica. |
| `budget` | `number` | Tasa de presupuesto. Unidades de moneda por 1 USD (lo que lee una persona). |
| `closing` | `number` | Tasa de cierre. Unidades por 1 USD. |
| `historical` | `number` | Tasa histórica. Unidades por 1 USD. |
| `budgetToUsd` | `number` | Tasa del sistema: USD por 1 unidad de moneda. Es la que guarda cada cifra convertida. |

`RateAlert`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `severity` | `'BLOQUEANTE' \| 'INFO'` | Severidad de la alerta. |
| `title` | `string` | Título corto. |
| `detail` | `string` | Detalle. |
| `rule` | `string` (opcional) | Regla que la originó. |

**Nota de unidades (importante):** `budget`, `closing` e `historical` se expresan en unidades por 1 USD. `budgetToUsd` se expresa en USD por 1 unidad. Son recíprocos. En la base, `groupExchangeRate."rateToUsd"` guarda USD por 1 unidad, así que `budget = 1 / rateToUsd` cuando la tasa es de presupuesto. El backend debe documentar la conversión que hace.

**Vista/tabla Supabase probable:**
- `rows`, `budget`, `closing`, `historical`, `budgetToUsd`: `groupExchangeRate` (`scenarioId`, `currencyCode`, `rateTypeCode`, `rateToUsd`), con `currency` y `rateType` como catálogos. Coincidencia clara.
- `conversionRules`: `rateType` (y `accountCategory` / alcance, por definir).
- `ctaUsd`: Por definir. Propuesta: `lineage` con `sourceTypeCode = 'CTA_CONVERSION'` o `consolidatedBalance."translationAdjustmentUsd"`.
- `alerts`: Por definir. Parcialmente `validationFinding` con `ruleCode` de tasas.
- `budgetPrevious`: Por definir (escenario anterior en `groupExchangeRate`).

---

### 2.7 Eliminaciones

**`GET /api/scenarios/{scenarioId}/eliminations?currency=USD`**
Repositorio: `EliminationRepository.getReport` (`HttpEliminationRepository`).
Pantalla: **Eliminaciones** (`/eliminaciones`).

| Query | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `currency` | `CurrencyCode` | Sí (hoy `USD`) | Moneda de presentación. Montos en USD. |

Respuesta: `EliminationReport`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `runId` | `string` | Corrida de consolidación. |
| `summary` | `{ pnl: number; balance: number; pending: number; ebitEffect: number; icIncome: number; icExpense: number; pairs: number }` | Resumen en USD: efectos de resultados (`pnl`), de balance (`balance`), pendientes, efecto en EBIT, ingresos y gastos IC, y cantidad de pares. |
| `entries` | `EliminationEntry[]` | Asientos de eliminación. |
| `fxIsolated` | `{ pnl: number; cta: number }` | Efecto cambiario aislado: en resultados y en CTA, en USD. |
| `capital` | `{ employedBefore: number; icRemoved: number; employedAfter: number; roceBefore: number; roceAfter: number }` | Capital empleado antes y después de eliminar IC, y ROCE antes y después. Montos en USD; ROCE como proporción. |

`EliminationEntry`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `rule` | `EliminationRule` | Regla aplicada: `E1` ventas y servicios, `E2` saldos, `E3` préstamos, `E4` intereses, `E7` diferencia cambiaria (los tipos incluyen también `E5` y `E6`). |
| `concept` | `string` | Concepto de la eliminación. |
| `accounts` | `string` | Cuentas involucradas, por ejemplo `4200 ↔ 5200`. |
| `issuerAmount` | `number` | Monto del emisor, en USD. |
| `receiverAmount` | `number` | Monto del receptor, en USD. |
| `difference` | `number` | Diferencia, en USD. |
| `targetAccount` | `string` | Cuenta que recibe la diferencia (por ejemplo, `7900` resultados o `3900` CTA). |

**Vista/tabla Supabase probable:**
- `entries`: `elimination` (`eliminationCode`, `eliminationRuleCode` → `rule`, `icDocumentId`, `groupAccountId`, `effectUsd`, `sourceRef`). Coincidencia clara. Se complementa con `eliminationRule` (catálogo E1 a E7).
- `summary`, `capital.roceBefore`, `capital.roceAfter`: Probablemente `vGroupKpi` (basis `AGREGADO` y `CONSOLIDADO`), con `roce` y `capitalEmployedUsd`. Por confirmar.
- `fxIsolated`: Por definir. Propuesta: `consolidatedBalance."translationAdjustmentUsd"` y `lineage` con `CTA_CONVERSION`.
- `concept`, `accounts`, `targetAccount`: Por definir (`groupAccount`).

---

### 2.8 Rentabilidad

**`GET /api/scenarios/{scenarioId}/profitability?view=`**
Repositorio: `ProfitabilityRepository.getReport` (`HttpProfitabilityRepository`).
Pantalla: **Rentabilidad** (`/rentabilidad`).

| Query | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `view` | `ProfitabilityView` | Sí | `consolidado` (con eliminación, oficial) o `sin-eliminar` (agregado, muestra el doble conteo). |

El frontend no envía `currency`.

Respuesta: `ProfitabilityReport`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `view` | `ProfitabilityView` | Vista consultada, eco del parámetro. |
| `wacc` | `number` | Costo promedio ponderado de capital. Proporción (`0.10` = 10 %). **Por confirmar** la unidad del parámetro. |
| `effectiveTaxRate` | `number` | Tasa de impuesto efectiva del grupo. Proporción. |
| `kpis` | `KpiBreakdown[]` | Desglose de ROIC, ROCE y EVA. |
| `byCompany` | `CompanyProfitability[]` | Indicadores por empresa. |
| `eliminationComparison` | `ComparisonRow[]` | Mismo dato, con y sin eliminación. |
| `unvalidatedComparison` | `ComparisonRow[]` | Indicadores con errores sin validar frente a los validados. |

`KpiBreakdown`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `code` | `'ROIC' \| 'ROCE' \| 'EVA'` | KPI. |
| `value` | `number` | Valor del KPI. USD para EVA; proporción para ROIC y ROCE. |
| `unit` | `'USD' \| 'RATIO'` | Unidad de `value`. |
| `formula` | `string` | Fórmula en texto. |
| `components` | `KpiComponent[]` | Componentes del cálculo. |
| `note` | `string` | Nota para la UI. |

`KpiComponent`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `label` | `string` | Nombre del componente. |
| `value` | `number` | Valor del componente. |
| `unit` | `'USD' \| 'RATIO'` | Unidad. |
| `lineageRef` | `string` (opcional) | Referencia al linaje para hacer drill-down. |

`CompanyProfitability`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `company` | `CompanyCode` | Empresa. |
| `name` | `string` | Nombre de la empresa. |
| `roic` | `number` | ROIC de la empresa (proporción). |
| `roce` | `number` | ROCE de la empresa (proporción). |
| `eva` | `number` | EVA de la empresa (USD). |

`ComparisonRow`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `label` | `string` | Nombre de la fila. |
| `left` | `number` | Valor de la izquierda (en la comparación). |
| `right` | `number` | Valor de la derecha (en la comparación). |
| `unit` | `'USD' \| 'RATIO'` | Unidad. |

**Vista/tabla Supabase probable:**
- `kpis`, `wacc`, `effectiveTaxRate`: `vGroupKpi` (`roic`, `roce`, `evaUsd`, `effectiveTaxRate`), con `basisCode` `CONSOLIDADO` para `consolidado` y `AGREGADO` para `sin-eliminar`. `wacc` viene de `consolidationRun."parameterSnapshot" ->> 'WACC'`.
- `components`: `vKpi` (`ebitUsd`, `nopatUsd`, `investedCapitalUsd`, `capitalEmployedUsd`, `salesUsd`).
- `byCompany`: `vCompanyKpi` (`roic`, `roce`, `evaUsd`).
- `eliminationComparison`: `vGroupKpi` con basis `AGREGADO` frente a `CONSOLIDADO`.
- `unvalidatedComparison`: Por definir. Requiere el estado de `validationFinding`.

---

### 2.9 Desviaciones (puente de variaciones)

**`GET /api/variance-bridge?from=&to=&metric=`**
Repositorio: `VarianceRepository.getBridge` (`HttpVarianceRepository`).
Pantalla: **Desviaciones** (`/desviaciones`).

**Nota:** esta ruta no lleva `scenarioId` en el path. Se propone `/api/scenarios/variance-bridge` o mantenerla como está. **Por confirmar.**

| Query | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `from` | `string` | Sí | Escenario de origen. `BridgeRequest.from`. El tipo `VarianceBridge.from.scenarioId` sugiere `scenarioId` (por ejemplo `PPTO_V1`). **Por confirmar.** |
| `to` | `string` | Sí | Escenario de destino (por ejemplo `PPTO_V2`). Debe ser distinto de `from`. |
| `metric` | `BridgeMetric` | Sí | `EBIT`, `VENTAS` o `EVA`. |

Respuesta: `VarianceBridge`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `metric` | `BridgeMetric` | Métrica explicada. |
| `from` | `{ scenarioId: string; label: string; value: number }` | Origen: escenario, etiqueta y valor de la métrica. |
| `to` | `{ scenarioId: string; label: string; value: number }` | Destino: escenario, etiqueta y valor de la métrica. |
| `effects` | `BridgeEffect[]` | Efectos (causas) del cambio. |
| `residual` | `number` | Diferencia no explicada por los efectos. Debe ser cero o estar dentro de la tolerancia. |
| `byCompany` | `CompanyEffect[]` | Efectos por empresa. |
| `eva` | `{ from: number; to: number; effects: { label: string; value: number }[] }` | Puente de EVA: valores de origen y destino, y efectos. |
| `narrative` | `Narrative \| null` | Texto generado por IA. La IA solo redacta cifras ya verificadas; no calcula. `null` si no hay narrativa. |

`BridgeEffect`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `id` | `string` | Identificador del efecto. |
| `code` | `EffectCode` | Tipo de efecto. |
| `label` | `string` | Etiqueta para la UI. |
| `value` | `number` | Valor del efecto. Unidad según `metric` (USD). |
| `companies` | `CompanyCode[]` | Empresas involucradas. |

`CompanyEffect`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `effect` | `EffectCode` | Tipo de efecto. |
| `label` | `string` | Etiqueta. |
| `company` | `CompanyCode` | Empresa. |
| `value` | `number` | Valor en USD. |

`Narrative`

| Campo | Tipo TS | Descripción |
|---|---|---|
| `text` | `string` | Texto de la narrativa. |
| `verifiedFigures` | `number` | Cantidad de cifras verificadas contra el puente. |
| `totalFigures` | `number` | Cantidad total de cifras en el texto. |
| `causes` | `{ text: string; sourceId: string }[]` | Causas citadas con su fuente. |

**Vista/tabla Supabase probable:**
- Cabecera del puente: `varianceBridge` (`bridgeId`, `fromRunId`, `toRunId`). La API recibe escenarios, así que debe resolver las corridas. **Por confirmar.**
- `effects`, `byCompany`: `varianceBridgeLine` (`effectCode` → `code`, `companyId`, `salesDeltaUsd`, `ebitDeltaUsd`, `icDetailUsd`). Coincidencia clara. El valor según `metric` se toma de `salesDeltaUsd` (VENTAS) o `ebitDeltaUsd` (EBIT).
- `eva.effects`: `varianceBridgeEva` (`effectCode`, `evaDeltaUsd`). Coincidencia clara.
- `residual`: `vVarianceBridgeCheck` (diferencia entre el puente y el delta de KPI, ±1 USD).
- `from.value`, `to.value`: `vGroupKpi` (`salesUsd`, `ebitUsd`, `evaUsd`) de cada corrida.
- `narrative`: Por definir. No hay tabla de narrativas en el esquema.
- Etiquetas de efectos: `varianceEffect`.

---

## 3. Notas para cerrar con NestJS

1. **Conteo de métodos:** 11 métodos, no 10 (ver sección 2).
2. **Prefijo `/api` y ubicación de `scenarioId`:** el resto de rutas lo llevan en el path, pero `ic/documents/{key}` lo manda en query (`?scenario=`), y `variance-bridge` lo manda en `from`/`to`. Proponer un estilo único.
3. **Parámetro `currency`:** solo lo envían `consolidation`, `ic/balances` y `eliminations`. Decidir si todas las rutas de montos lo aceptan.
4. **Unidades de tasas:** `budget`, `closing` e `historical` son unidades por USD; `budgetToUsd` es USD por unidad. La base guarda USD por unidad (`rateToUsd`).
5. **Campos `pct` y `controlBandPct`:** confirmar si son proporción (`0.01`) o porcentaje (`1`). La regla del proyecto es proporción.
6. **`findingId`:** es `bigint` en la base; se propone string en JSON.
7. **`accept-correction`:** responder 204 para que `httpClient` no intente parsear JSON. Falta columna para la justificación.
8. **Vista `facturado`:** la base devuelve `billedUsd`, pero el tipo `MatrixCell` usa `balanceUsd`.
9. **Variance:** confirmar si `from`/`to` son `scenarioId` o `runId`.
10. **Timeout del frontend:** `httpClient` no aplica el timeout de 30 s cuando el llamador pasa `signal`. Revisar en el frontend.
11. **Seguridad:** las vistas usan `security_invoker = true`. El backend debe consultar con la identidad del usuario para que aplique RLS.

---

## 4. Resumen de endpoints

| # | Método | Ruta (con prefijo `/api`) | Query params | Puerto (interfaz) | Método del repositorio (adaptador) | Pantalla |
|---|---|---|---|---|---|---|
| 1 | GET | `/api/scenarios/{scenarioId}/consolidation` | `currency` | `ConsolidationRepository` | `getSummary` (`HttpConsolidationRepository`) | Presupuesto consolidado (`/`) |
| 2 | GET | `/api/scenarios/{scenarioId}/validation` | ninguno | `ValidationRepository` | `getReport` (`HttpValidationRepository`) | Carga y validación (`/validacion`), cabecera |
| 3 | POST | `/api/validation/findings/{findingId}/accept-correction` | body `{ justification }` | `ValidationRepository` | `acceptCorrection` (`HttpValidationRepository`) | Carga y validación |
| 4 | GET | `/api/scenarios/{scenarioId}/ic/reconciliation` | `type`, `period` (opcionales) | `ReconciliationRepository` | `getReport` (`HttpReconciliationRepository`) | Conciliación (`/conciliacion`) |
| 5 | GET | `/api/scenarios/{scenarioId}/ic/balances` | `view` (obligatorio), `currency` | `CurrentAccountRepository` | `getMatrix` (`HttpCurrentAccountRepository`) | Cuenta corriente (`/cuenta-corriente`) |
| 6 | GET | `/api/scenarios/{scenarioId}/ic/balances/{company}/{counterparty}` | ninguno | `CurrentAccountRepository` | `getPair` (`HttpCurrentAccountRepository`) | Cuenta corriente (detalle) |
| 7 | GET | `/api/ic/documents/{key}` | `scenario` | `IcDocumentRepository` | `getDocument` (`HttpIcDocumentRepository`) | Documento y linaje (`/documentos/:key`) |
| 8 | GET | `/api/scenarios/{scenarioId}/rates` | ninguno | `RatesRepository` | `getTable` (`HttpRatesRepository`) | Tasas del grupo (`/tasas`) |
| 9 | GET | `/api/scenarios/{scenarioId}/eliminations` | `currency` | `EliminationRepository` | `getReport` (`HttpEliminationRepository`) | Eliminaciones (`/eliminaciones`) |
| 10 | GET | `/api/scenarios/{scenarioId}/profitability` | `view` (obligatorio) | `ProfitabilityRepository` | `getReport` (`HttpProfitabilityRepository`) | Rentabilidad (`/rentabilidad`) |
| 11 | GET | `/api/variance-bridge` | `from`, `to`, `metric` (obligatorios) | `VarianceRepository` | `getBridge` (`HttpVarianceRepository`) | Desviaciones (`/desviaciones`) |

Rutas de los adaptadores (sin prefijo): cada `path` del adaptador se publica bajo `/api`. Por ejemplo, `/scenarios/${id}/consolidation` se convierte en `/api/scenarios/{scenarioId}/consolidation`.
