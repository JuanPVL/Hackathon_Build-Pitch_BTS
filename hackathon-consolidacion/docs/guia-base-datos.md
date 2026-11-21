# Guía de la base de datos

Para leer la base tabla por tabla y entender qué parte del reto resuelve cada una. Scripts en `supabase/01…06`,
diagramas en `diagrama-entidad-relacion.md` y `diagrama-procesos.md`.

> **El reto:** que el presupuesto de un grupo se consolide solo, en una moneda, sin capturas manuales, y que cada
> cifra se explique sola. **El demo debe probar:** que funciona con los datos dados, que encuentra los errores
> sembrados y que un director rastrea cada cifra hasta el registro que la originó.

---

## 1. Veredicto: ¿la base cubre el reto?

| Dolor / entregable del reto | Dónde vive en la base | Estado |
|---|---|---|
| **Consolidación manual** (cada empresa en otro formato) | `accountMapping` traduce el plan de cuentas local de cada país al de grupo; `dataLoad`/`dataLoadLine` reciben los archivos tal cual | ✅ Cubierto a nivel de cuentas. Las columnas del archivo son las mismas para todos (así vienen los datos); no hay tabla de "layouts" por empresa |
| **Ventas entre empresas contadas doble** | `icDocument` + `icReceivable`/`icPayable` espejo, `vIcPair`, `icReconciliation`, `elimination` | ✅ Cubierto, con reglas: solo se elimina lo conciliado |
| **Varias monedas sin tasa oficial** | `groupExchangeRate` (tasa única de grupo), `company.functionalCurrencyCode`, `vLineUsd` | ✅ Cubierto: siempre se convierte con la moneda funcional y la tasa de grupo, nunca la del archivo |
| **ROIC, ROCE y EVA copiados a mano** | `consolidatedBalance` (total generado), `vKpi`, `vGroupKpi`, `vCompanyKpi` | ✅ Cubierto: ventas, EBIT, tasa efectiva, NOPAT, capital invertido y empleado, ROIC, ROCE, WACC y EVA, por grupo (consolidado y sin eliminar) y por empresa. Coinciden con el oráculo |
| **Desviaciones sin explicar** (explicador V1→V2) | `varianceEffect`, `varianceBridge`, `varianceBridgeLine`, `varianceBridgeEva`, `vVarianceBridgeCheck` | ✅ Cubierto: qué cambió (efecto), dónde (empresa, cuenta, periodo) y por qué (volumen, precio, tipo de cambio, costo, gasto, IC); el bridge de EVA; y una vista que comprueba que todo suma |
| **Validador que frene el error** | `validationRule`, `validationFinding`, `severity`, estados de `dataLoad` (CUARENTENA / PENDIENTE_APROBACION / APROBADA), `vLineCounterparty` | ✅ Cubierto. Catálogo con las 20 reglas de la especificación (V01–V20) |
| **Encontrar los errores sembrados** | `validationFinding` (el seed 06 trae los 20 hallazgos esperados de V1) | ✅ La estructura soporta los 14 errores; el cálculo de cada regla lo hace el validador que construya el equipo |
| **Cada cifra rastreable hasta su registro** | `lineage` → `dataLoadLine.lineId` (`archivo#filaN`) → `dataLoad` (archivo, quién subió, quién aprobó) + `audit.changeLog`; `vLineageDetail` lo junta en una sola consulta | ✅ Cubierto (ejemplo en la sección 3) |
| **Sin capturas manuales** | Totales como columna generada, KPIs como vistas, CxP IC solo por trigger, corridas inmutables | ✅ Cubierto |
| **Seis empresas, tres monedas** | `company`, `currency`, `country`, `counterparty` | ✅ Cubierto; agregar una empresa o moneda es insertar una fila |

**En resumen:** la base cubre los cuatro entregables del reto (motor de consolidación, explicador de desviaciones,
tablero de ROIC/ROCE/EVA y validador) más la conversión de moneda y la trazabilidad. Lo que queda abierto son
mejoras menores (sección 5).

---

## 2. Cómo está organizada (5 bloques)

```
Catálogos  ─┐                         ┌─ Intercompany (icDocument, icReceivable, icPayable)
            ├─► Maestros ─► Cargas ───┤
Estados    ─┘   (empresa,   (archivo,  └─► Consolidación (corrida, conciliación, eliminación,
                 cuentas,    líneas,        consolidado, linaje) ─► KPIs (vistas)
                 tasas)      hallazgos)
Seguridad y auditoría: atraviesan todo (quién ve qué, quién cambió qué)
```

Convenciones que conviene saber antes de leer:
- Nombres en inglés, singular y camelCase; en SQL van **entre comillas**: `select * from "dataLoad"`.
- Los **códigos** de catálogo están en español (`APROBADA`, `PYG`, `VENTAS`) porque así vienen los CSV y el motor de referencia.
- Toda columna tiene comentario con su nombre anterior: en Supabase, pase el cursor sobre la columna o use `\d+ "tabla"`.
- Catálogos, maestros e `icDocument` llevan `createdAt`, `createdBy`, `updatedAt`, `updatedBy`; catálogos y maestros, además, `isActive` (no se borran, se desactivan).

---

## 3. Una cifra rastreada de punta a punta (lo que verá el director)

"¿Por qué las ventas intercompany consolidadas son cero?"

1. `consolidatedBalance` cuenta **4200**: `aggregatedUsd` = lo que suman las empresas, `eliminationsUsd` = lo mismo con signo contrario, `consolidatedUsd` = 0 (columna generada, nadie la escribe).
2. `elimination` con `eliminationCode = 'EL-0001'`, regla **E1**: documento **IC-F1-2027-01**, GT1 cuenta 4200 −8,333.33 USD y MX1 cuenta 5200 −8,411.77 USD.
3. Su `sourceRef` = `presupuesto_GT1_V2.csv#fila6`, que es un `dataLoadLine.lineId`: la fila 6 del archivo de GT1, con monto en GTQ, socio MX1 y documento IC-F1-2027-01.
4. `dataLoad` de esa línea: archivo, versión, quién lo subió, quién lo aprobó y cuándo.
5. `icReconciliation` explica por qué se pudo eliminar: `CONCILIADO_FX` (mismo monto en moneda de transacción, la diferencia en USD está dentro de la tolerancia y va a 7900).
6. `lineage` repite esto para **cada** cifra: suma de `contributionUsd` = `consolidatedUsd`, y la corrida guarda `lineageOk = true`.
7. Todo lo anterior en una consulta: `select * from "vLineageDetail" where "groupAccountId" = '4200'` (cifra → aporte → fila → archivo → quién lo subió y aprobó).

"¿Por qué bajó el EVA de V1 a V2?" → `varianceBridgeEva`: el EBIT después de impuestos sumó, pero el WACC subió de 10 % a 11 % y eso pesa más.
"¿Y el EBIT?" → `varianceBridgeLine` agrupado por efecto y empresa: volumen de MX1, precio de GT1, tipo de cambio del MXN, costos.

---

## 4. Tabla por tabla

Formato: **para qué sirve** · quién la llena · regla importante que la protege.

### 4.1 Catálogos (listas de valores; nada está escrito fijo en el código)

| Tabla | Para qué sirve | Ejemplo de valores |
|---|---|---|
| `currency` | Monedas del grupo | GTQ, MXN, USD |
| `country` | Países; define qué plan de cuentas local aplica | GT (NIT), MX (RFC), US (EIN) |
| `financialStatement` | Tipo de archivo / estado financiero y su tasa por defecto | PYG → PRESUPUESTO, BALANCE → CIERRE |
| `rateType` | Tipos de tasa | PRESUPUESTO, PROMEDIO, CIERRE, HISTORICA |
| `accountType` | Elemento contable y su signo para KPIs | ING (+1), GAS (−1), ACT (+1), PAS (−1), PAT (−1) |
| `accountCategory` | Rubro que alimenta los KPIs (`kpiGroupCode`, `isSales`) | VENTAS/COSTO/GASTO_OP → EBIT; CTO → capital de trabajo; AF → activo fijo; VENTAS cuenta como ventas |
| `varianceEffect` | Causas del explicador de desviaciones | LINE: Volumen, Precio, Tipo de cambio, Costo, Gasto, IC neutral · EVA: EBIT después de impuestos, Tasa, WACC, Capital |
| `severity` | Gravedad de un hallazgo | B bloquea, A exige justificación, I informativo |
| `validationRule` | Reglas del validador | V01 … V20 |
| `statusDomain`, `status` | Estados posibles por objeto, con banderas de comportamiento | `APROBADA.isConsolidable`, `CONCILIADO.allowsElimination` |
| `statusTransition` | Qué cambios de estado se permiten y cuáles piden motivo | `PENDIENTE_APROBACION → APROBADA` exige justificación |
| `icDocumentType` | Tipos de transacción IC y qué cuentas toca cada pata | VENTA: 4200/5200 y 1250/2150, regla E1 |
| `eliminationRule` | Reglas de eliminación | E1 ventas, E2 saldos, E3 préstamo, E4 intereses, E7 dif. FX |
| `lineageSourceType` | De dónde viene un aporte al consolidado | LINEA_CARGA, ELIMINACION_E1…E7, CTA_CONVERSION |
| `parameterDefinition` | Qué parámetros existen, su unidad y rango válido | WACC (0–1), TOLERANCIA_FX_USD |
| `counterpartyType` | Distingue grupo de externos | INTERCOMPANY, THIRD_PARTY |
| `period` | Calendario mensual | 2025-01 … 2030-12 |

### 4.2 Maestros (los datos del grupo)

| Tabla | Para qué sirve | Regla clave |
|---|---|---|
| `company` | Las 6 empresas: país, moneda funcional, id fiscal, tasa de ISR | La moneda funcional manda en la conversión |
| `counterparty` | Clientes y proveedores. Cada empresa del grupo es automáticamente una contraparte **INTERCOMPANY**; los externos son **THIRD_PARTY** (VARIOS = genérico) | Un id fiscal existe una sola vez: una empresa del grupo nunca puede registrarse como tercero (base de V13) |
| `groupAccount` | Plan de cuentas del grupo (25 cuentas) | Una cuenta IC apunta a su cuenta espejo y esta le devuelve la referencia (4200 ↔ 5200) |
| `accountMapping` | Cuenta local de cada país → cuenta de grupo | Si una cuenta local no está aquí, es V03 |
| `scenario` | Versiones del presupuesto: PPTO_V1, PPTO_V2 | Cerrado = solo lectura; cerrar con IC pendiente pide motivo |
| `parameter` | Valor de cada parámetro por escenario (WACC 10 % / 11 %) | Debe caer en el rango de `parameterDefinition` |
| `groupExchangeRate` | **La** tabla de tasas del grupo (USD por unidad) | Una sola fuente; no se toca con el escenario cerrado |
| `transferPricingPolicy` | Política de precios de transferencia (fee de gestión 2 %–5 %) | Base de V14 |

### 4.3 Cargas y validación

| Tabla | Para qué sirve | Regla clave |
|---|---|---|
| `dataLoad` | Un archivo subido por empresa, escenario y tipo, con versión y estado | Solo una APROBADA por combinación; aprobar otra versión reemplaza la anterior en la misma transacción; nunca se aprueba con hallazgos B |
| `dataLoadLine` | Cada fila del archivo tal cual vino (`lineId = archivo#filaN`) | Sin FKs a propósito, para poder recibir errores; congelada al aprobarse |
| `validationFinding` | Lo que encontró el validador: regla, registro, encontrado vs esperado, impacto en USD | Las B bloquean la aprobación; las A exigen justificación |

### 4.4 Intercompany

| Tabla | Para qué sirve | Regla clave |
|---|---|---|
| `icDocument` | La transacción entre dos empresas: emisor (vende o presta) y receptor | Al emitirse se congelan montos y partes; nunca se borra, se anula o se emite nota de crédito |
| `icReceivable` | Cuenta por cobrar del emisor | Solo la crea el trigger al emitir |
| `icPayable` | Cuenta por pagar espejo del receptor, con quién la aceptó | Solo la crea el trigger; solo el receptor acepta o disputa |

### 4.5 Consolidación (cada corrida es una foto inmutable)

| Tabla | Para qué sirve | Regla clave |
|---|---|---|
| `consolidationRun` | Una ejecución del motor: guarda parámetros y huella de tasas usados | No se modifica después |
| `consolidationRunLoad` | Qué cargas entraron a la corrida | Solo cargas APROBADA del mismo escenario |
| `icReconciliation` | Resultado del pareo por documento: CONCILIADO, CONCILIADO_FX, DIFERENCIA_MONTO, SIN_CONTRAPARTE, DIFERENCIA_CORTE… | Define qué se puede eliminar |
| `elimination` | Asientos de eliminación por pata (`companyId` nulo = asiento de grupo, como E7) | Solo para documentos conciliados en la misma corrida |
| `consolidatedBalance` | Resultado por cuenta: agregado, eliminaciones, CTA y consolidado | El consolidado es columna generada |
| `lineage` | Aporte de cada línea, eliminación o CTA a cada cifra | Σ aportes = consolidado (`lineageOk`) |

### 4.5b Explicador de desviaciones (entre dos corridas)

| Tabla | Para qué sirve | Regla clave |
|---|---|---|
| `varianceBridge` | Encabezado: compara una corrida "antes" con una "después" (PPTO_V1 corregida → PPTO_V2) | Una por par de corridas; inmutable |
| `varianceBridgeLine` | Qué cambió, dónde y por qué: efecto × empresa × cuenta × periodo, con ΔVentas y ΔEBIT en USD | Solo efectos de tipo LINE (FK al catálogo) |
| `varianceBridgeEva` | Por qué cambió el EVA del grupo: EBIT después de impuestos, tasa efectiva, WACC, capital invertido | Solo efectos de tipo EVA |

### 4.6 Vistas (cálculos, nunca capturas)

| Vista | Qué responde |
|---|---|
| `vMappedLine` | Cada línea con su cuenta de grupo y el tipo de tasa que le toca (cuenta nula → V03) |
| `vLineUsd` | Cada línea convertida a USD con la tasa de grupo |
| `vAggregate` | Suma simple por cuenta de las cargas aprobadas (todavía cuenta doble el IC) |
| `vIcPair` | Pata del emisor contra pata del receptor por documento |
| `vIcBilledMatrix`, `vIcBalanceMatrix` | Matriz 6×6: cuánto se facturaron y cuánto se deben entre empresas |
| `vLineCounterparty` | Detecta IC disfrazado de tercero (V13), autofacturación (V11) y socios desconocidos |
| `vKpiBalance` | Insumo único de los KPIs: saldo por corrida × base (CONSOLIDADO, AGREGADO, EMPRESA) × cuenta |
| `vKpi` | Todos los KPIs: ventas, EBIT, tasa efectiva, NOPAT, capital invertido y empleado, ROIC, ROCE, WACC (de la foto de la corrida) y EVA |
| `vGroupKpi` | KPIs del grupo: CONSOLIDADO (oficial) y AGREGADO (sin eliminar, muestra el conteo doble) |
| `vCompanyKpi` | KPIs de cada empresa por separado, con su tasa de ISR |
| `vLineageDetail` | Rastreo para el director: cada aporte a una cifra con su fila, archivo, quién subió y quién aprobó |
| `vVarianceBridgeCheck` | Comprueba que el bridge suma exacto a ΔVentas, ΔEBIT y ΔEVA entre las dos corridas (`isBalanced`) |

### 4.7 Seguridad y auditoría

| Tabla | Para qué sirve |
|---|---|
| `accessRole` | Roles: GROUP_CONTROLLER, AUDITOR, COMPANY_ACCOUNTANT, COMPANY_VIEWER y sus permisos |
| `userCompanyAccess` | Qué usuario tiene qué rol en qué empresa (nula = todo el grupo) |
| `audit.changeLog` | Bitácora de solo inserción: antes, después, campos cambiados, usuario, motivo y transacción de cada cambio |

---

## 5. Brechas: qué se cerró y qué queda

| # | Brecha | Estado |
|---|---|---|
| 1 | Explicador de desviaciones | ✅ Cerrada: `varianceEffect`, `varianceBridge`, `varianceBridgeLine`, `varianceBridgeEva`, `vVarianceBridgeCheck`; el seed 06 carga el bridge V1→V2 del oráculo |
| 2 | KPIs incompletos | ✅ Cerrada: `vKpi`, `vGroupKpi` (consolidado y sin eliminar), `vCompanyKpi`; coinciden con el oráculo |
| 3 | Consolidado anual, sin mes ni empresa | Abierta (menor): para filtrar por mes usar `vLineUsd`; por empresa, `lineage` o `vCompanyKpi`. El oráculo también consolida anual |
| 4 | Reglas V15, V16, V17 y V19 | ✅ Cerrada: el catálogo tiene las 20 reglas (su cálculo lo hace el validador) |
| 5 | Vista de rastreo directo | ✅ Cerrada: `vLineageDetail` |
| 6 | Layouts de archivo distintos por empresa | Abierta (opcional): los datos del reto usan las mismas columnas en todos los países; las diferencias de plan de cuentas ya las resuelve `accountMapping` |
