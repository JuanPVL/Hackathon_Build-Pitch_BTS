# Hackathon — Consolidación de presupuesto de grupo multimoneda

> **Reto:** que el presupuesto de un grupo se consolide solo, en una moneda, sin capturas manuales, y que cada cifra se explique sola.

Este paquete es el **punto de partida para iterar**. Trae:

1. Un **grupo ficticio** (6 empresas, 3 monedas, presupuesto 2027 mensual + balance de cierre) con **14 errores sembrados**.
2. La **hoja de respuestas** (qué errores hay y qué resultado correcto debe salir).
3. Un **motor de referencia** en Python que resuelve todo de punta a punta: valida, concilia IC, consolida, elimina, calcula KPIs y explica desviaciones. Es el **oráculo**: lo que construyan en Supabase/React debe dar los mismos números.
4. El **esquema de base de datos** para Supabase (probado en PostgreSQL) con los seeds de datos.
5. La **especificación funcional** completa.

---

## 1. Estructura

```
hackathon-consolidacion/
├── README.md                          ← este archivo
├── docs/
│   ├── consolidacion-intercompany.md  ← especificación funcional y técnica (el "qué" y el "por qué")
│   ├── diccionario-datos.md           ← cada archivo y cada columna del dataset
│   ├── guia-base-datos.md             ← qué hace cada tabla, cobertura del reto y brechas
│   ├── diagrama-entidad-relacion.md   ← modelo de datos (Mermaid, generado del catálogo real)
│   ├── diagrama-procesos.md           ← flujo de punta a punta, ciclo IC, corrida y máquinas de estado
│   └── plan-iteraciones.md            ← iteraciones, criterios de aceptación y pruebas por iteración
├── datos/                             ← LO QUE RECIBE EL SISTEMA (como si fueran los archivos de los países)
│   ├── maestros/                      ← empresas, monedas, plan de cuentas de grupo, mapeo, parámetros, política TP
│   ├── tasas/                         ← tasas de grupo V1 (con 1 error sembrado) y V2
│   ├── cargas_v1/                     ← presupuesto + balance por empresa, V1, CON errores sembrados
│   └── cargas_v2/                     ← V2 limpia, con cambios de negocio (para probar el explicador)
├── _respuestas/                       ← ⚠️ NO ABRIR mientras construyen el validador (prueba a ciegas)
│   ├── errores-sembrados.md           ← los 14 errores, dónde están y qué regla los debe detectar
│   ├── errores_sembrados.csv
│   ├── cargas_v1_corregidas/          ← la verdad: V1 sin errores
│   └── tasas_grupo_V1_corregida.csv
├── referencia/
│   ├── generar_datos.py               ← regenera todo el dataset (determinístico)
│   └── motor_referencia.py            ← el oráculo
├── resultados_referencia/             ← salida del oráculo = RESULTADOS ESPERADOS
│   ├── reporte_referencia.md          ← empiecen por aquí
│   └── *.csv                          ← hallazgos, conciliación, eliminaciones, consolidado, linaje, KPIs, bridge
└── supabase/
    ├── 01_schema.sql                  ← catálogos, maestros, contrapartes IC/terceros, cargas, IC, consolidación, auditoría, vistas
    ├── 02_seed_master_data.sql        ← maestros, escenarios, parámetros, tasas, catálogo de reglas
    ├── 03_seed_loads_v1_with_errors.sql
    ├── 04_seed_loads_v2.sql
    ├── 05_security_rls.sql            ← roles, acceso por empresa, RLS
    ├── 06_seed_demo_data.sql          ← demo: hallazgos V1, documentos IC, corridas V1 corregida y V2, bridge V1→V2
    ├── generar_seed_sql.py            ← genera 02, 03, 04 y 06 desde datos/ y resultados_referencia/
    └── _original_es/                  ← esquema y seeds originales (español), solo referencia
```

---

## 2. El grupo ficticio en una tabla

| Empresa | Nombre | País | Moneda | ISR | Rol en el grupo |
|---|---|---|---|---|---|
| GT1 | Alfa Guatemala | GT | GTQ | 25 % | Operativa; vende a MX1, compra a GT2 |
| GT2 | Beta Guatemala | GT | GTQ | 25 % | Operativa; vende a GT1, compra a US1 |
| MX1 | Alfa México | MX | MXN | 30 % | Operativa; vende a MX2, compra a GT1, tiene préstamo de US2 |
| MX2 | Gamma México | MX | MXN | 30 % | Operativa; compra a MX1 |
| US1 | Alfa USA | US | USD | 21 % | Operativa; vende a GT2 |
| US2 | Delta Holding USA | US | USD | 21 % | Holding: cobra servicios de gestión a todas y presta USD 2M a MX1 |

**Flujos intercompany (mensuales):** 4 ventas entre empresas, 5 fees de gestión de la holding, 1 préstamo con intereses → **131 documentos IC** al año (P&L + saldos de cierre).

**Monedas y tasas:** cada empresa presupuesta en su moneda funcional. El grupo convierte a USD con **una sola tabla de tasas** (presupuesto para P&L, cierre para balance, histórica para capital). Los países registran lo facturado en otra moneda con **su propia tasa local**, que difiere un poco de la del grupo. Eso genera diferencias cambiarias IC realistas que el motor debe aislar.

---

## 3. Cómo arrancar (30 minutos)

### 3.1 Ver el resultado esperado
```bash
cd referencia
python generar_datos.py        # opcional: ya vienen generados
python motor_referencia.py     # requiere pandas
# leer: resultados_referencia/reporte_referencia.md
```

### 3.2 Levantar la base en Supabase
1. Crear proyecto en Supabase.
2. En el **SQL Editor**, ejecutar en orden: `01_schema.sql` → `02_seed_master_data.sql` → `03_seed_loads_v1_with_errors.sql` → `04_seed_loads_v2.sql` → `05_security_rls.sql` → `06_seed_demo_data.sql`.
   - `05` es opcional hasta tener login: después de 05 la anon key no ve nada y cada usuario necesita una fila en `"userCompanyAccess"` (plantilla comentada al final de `06`; los `userId` deben existir en Authentication > Users).
   - `06` deja la base poblada para demo: aprueba V2, pone en `CUARENTENA` las cargas V1 con hallazgos, corrige la tasa MXN invertida (E01, auditado), crea 121 documentos IC conciliados (con su CxC/CxP espejo), dos corridas con los resultados del oráculo (V1 corregida y V2) y el bridge V1→V2 del explicador. KPIs en `"vGroupKpi"` / `"vCompanyKpi"`, explicación en `"varianceBridgeLine"` / `"varianceBridgeEva"`, comprobación en `"vVarianceBridgeCheck"`. **Si el equipo va a construir el validador y el motor, no ejecuten `06`**: las cargas deben quedar en `RECIBIDA`.
   - Cada archivo es una sola transacción: si algo falla no queda nada a medias.
3. Esquema en inglés, singular y camelCase: los identificadores van **entre comillas** (`"dataLoad"`, `"statusCode"`). Cada columna tiene `COMMENT` con su nombre anterior (`legacy: ...`); el esquema original en español quedó en `supabase/_original_es/`.
4. Las cargas entran en estado `RECIBIDA`. El consolidado solo lee estados con `"status"."isConsolidable"` (`APROBADA`): **el validador es el que debe cambiar ese estado**. Las transiciones permitidas están en `"statusTransition"` y toda modificación queda en `audit."changeLog"`.
5. Prueba rápida:
```sql
update "dataLoad" set "statusCode" = 'APROBADA' where "scenarioId" = 'PPTO_V2';
select * from "vAggregate" where "scenarioId" = 'PPTO_V2' order by 2;   -- debe igualar la columna "agregado" de resultados_referencia/v2_consolidado.csv
select * from "vIcPair" where "scenarioId" = 'PPTO_V2' and ("issuerLineId" is null or "receiverLineId" is null);  -- 0 filas
select * from "vLineCounterparty" where "alertCode" is not null;          -- V13 / V11 en V1: MX1 fila 52 y US2 fila 98
```

> Esto ya se probó en PostgreSQL: el esquema y los seeds cargan sin errores, `v_agregado` de V2 cuadra con el oráculo en las 23 cuentas (diferencias de centavos por redondeo por línea), `v_ic_pares` encuentra en V1 los mismos 6 documentos huérfanos y la diferencia de corte, y el trigger crea la CxC y la CxP espejo al emitir un documento IC.

---

## 4. Números que tienen que salir (resumen del oráculo)

| Vista | Ventas USD | EBIT USD | ROIC | ROCE | EVA USD |
|---|---:|---:|---:|---:|---:|
| Ingenuo (sumar los Excel con errores) | 158,955,257 | −41,491,120 | −191.9 % | −202.8 % | −30,596,903 |
| V1 corregida **sin eliminar** IC | 13,938,462 | 2,359,154 | 11.56 % | 11.53 % | 236,307 |
| **V1 corregida consolidada** | **12,938,462** | **2,360,308** | **11.57 %** | **12.79 %** | **237,139** |
| **V2 consolidada** | **12,957,553** | **2,408,907** | **11.95 %** | **13.22 %** | **142,157** |

- Validador sobre V1 con errores: **20 hallazgos (18 bloqueantes, 2 advertencias); 14 de 14 errores sembrados detectados**.
- V1 corregida y V2: **0 hallazgos**.
- Conciliación IC: 131 documentos (39 exactos + 92 con diferencia FX dentro de tolerancia), 0 huérfanos.
- Linaje: Σ aportes = consolidado en todas las cuentas (V1 y V2).
- Explicador V1→V2: Δ EBIT = +48,599 = volumen MX1 +300,000 − costo de ventas 120,000 − precio GT1 90,000 − tipo de cambio 41,401. **Suma exacta.** El EVA baja 94,982 sobre todo por el WACC (10 % → 11 %: −149,432).

El detalle está en `resultados_referencia/reporte_referencia.md`.

---

## 5. Cómo iterar (el ciclo)

```
1. Elegir la siguiente iteración de docs/plan-iteraciones.md
2. Construir en Supabase/React
3. Correr sobre datos/ (V1 con errores y V2)
4. Comparar contra resultados_referencia/*.csv  ← misma llave, mismos números
5. Si difiere: abrir el linaje de esa cuenta en ambos lados y encontrar la línea que no coincide
6. Si el oráculo está mal (puede pasar): corregir motor_referencia.py, regenerar y anotarlo
```

**Reglas de juego:**
- Nadie escribe un total, un saldo ni un KPI a mano: si un número no sale de una consulta, está mal.
- No abrir `_respuestas/` hasta que el validador esté construido. La prueba es que lo encuentre a ciegas.
- Para cambiar el dataset (más errores, otra empresa, otra moneda) se edita `generar_datos.py` y se regenera todo, incluidos los seeds SQL (`python supabase/generar_seed_sql.py`). No se editan los CSV a mano.
- Si llegan datos reales del organizador, solo cambia la capa de carga (mapeo de columnas → `linea_carga`). Todo lo demás se queda igual.

---

## 6. Convenciones del dataset (lo mínimo para no equivocarse)

- **Montos siempre positivos.** La naturaleza (ingreso, gasto, activo…) la da la cuenta de grupo. Un monto negativo es un error (V07).
- **Tasa = USD por 1 unidad de moneda** (GTQ ≈ 0.1282, MXN ≈ 0.0556). Si ven 7.80 o 18.00, está invertida.
- **Periodo = `AAAA-MM`.** El balance solo trae `2027-12` (cierre).
- **Toda línea IC trae `socio_ic` + `doc_ic_id` + `moneda_tx` + `monto_tx`.** El `doc_ic_id` es la llave de conciliación: las dos patas lo comparten.
- **`linea_id = <archivo>#fila<N>`** (N como en Excel, con encabezado en la fila 1). Es el ancla del linaje: cualquier cifra debe poder llegar ahí.
