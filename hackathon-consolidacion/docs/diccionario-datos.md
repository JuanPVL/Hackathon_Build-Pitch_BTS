# Diccionario de datos — dataset de prueba

Todos los archivos son CSV UTF-8 con encabezado y coma como separador. Números con punto decimal, sin separador de miles.

---

## 1. Maestros (`datos/maestros/`)

### `empresas.csv`
| Columna | Tipo | Descripción |
|---|---|---|
| `empresa_id` | texto | GT1, GT2, MX1, MX2, US1, US2 |
| `nombre` | texto | Razón social ficticia |
| `pais` | texto | GT / MX / US: decide qué plan de cuentas local usa (mapeo) |
| `moneda_funcional` | texto | Moneda en que la empresa presupuesta |
| `id_fiscal` | texto | NIT / RFC / EIN ficticio. Sirve para detectar ventas IC disfrazadas de venta a terceros (V13) |
| `tasa_isr` | número | Tasa de impuesto sobre la renta (0–1). Se usa para la tasa efectiva del NOPAT |

### `monedas.csv`
`moneda_id`, `nombre`, `decimales`. Son tres: GTQ, MXN, USD.

### `cuentas_grupo.csv` — plan de cuentas homologado
| Columna | Descripción |
|---|---|
| `cuenta_grupo_id` | Código de grupo (4100, 5200, 1250…) |
| `tipo` | ING, GAS, ACT, PAS, PAT. Define el signo natural |
| `rubro` | Agrupador para KPIs: VENTAS, OTROS_ING_OP, COSTO, GASTO_OP, FINANCIERO, ISR, EFECTIVO, CTO, AF, PRESTAMO_IC, DEUDA, PATRIMONIO |
| `es_ic` | 1 = cuenta intercompany (exige `socio_ic`) |
| `cuenta_contraparte_ic` | Cuenta espejo en la otra empresa (4200 ↔ 5200, 4300 ↔ 6200, 7300 ↔ 7200, 1250 ↔ 2150, 1600 ↔ 2250) |
| `corriente` | S/N para cuentas de balance (pasivo corriente → capital empleado) |

Cuentas solo de consolidación (ninguna empresa las carga): **7900** diferencia cambiaria IC y **3900** CTA.

**Definiciones de KPI a partir de rubros:**
- EBIT = VENTAS + OTROS_ING_OP − COSTO − GASTO_OP
- Capital invertido = CTO (1200 + 1250 + 1300 − 2100 − 2150) + AF (1500)
- Capital empleado = Activo total − Pasivo corriente (2100 + 2150)
- NOPAT = EBIT × (1 − t), con t = ISR ponderada por el EBIT positivo de cada empresa
- ROIC = NOPAT / Capital invertido · ROCE = EBIT / Capital empleado · EVA = NOPAT − WACC × Capital invertido
- El dataset solo trae balance de cierre, así que se usan **saldos de cierre** y no promedio. Esta es una simplificación documentada; se puede extender con un balance de apertura.

### `mapeo_cuentas.csv`
`pais`, `cuenta_local`, `cuenta_grupo_id`. Cada país tiene su propio catálogo local:
- GT usa códigos tipo `4.1.01`
- MX usa mnemónicos tipo `VTA-NAC`
- US usa números tipo `4000`

### `parametros_V1.csv` / `parametros_V2.csv`
| Parámetro | V1 | V2 | Uso |
|---|---|---|---|
| `WACC` | 0.10 | 0.11 | EVA |
| `TOLERANCIA_FX_USD` | 50 | 50 | Conciliación IC: diferencia aceptada por documento |
| `TOLERANCIA_FX_PCT` | 0.02 | 0.02 | Ídem en %. Basta que se cumpla una de las dos |
| `UMBRAL_ESCALA` | 10 | 10 | V09: veces sobre la mediana de la cuenta |
| `BANDA_TASA_PCT` | 0.25 | 0.25 | V08: variación máxima de una tasa vs su mediana |

### `politicas_tp.csv`
Una política: **TP-MGMT**. Los servicios de gestión de la holding deben estar entre el 2 % y el 5 % de las ventas a terceros del receptor (V14).

---

## 2. Tasas (`datos/tasas/tasas_grupo_V*.csv`)

| Columna | Descripción |
|---|---|
| `escenario` | PPTO_V1 / PPTO_V2 |
| `periodo` | AAAA-MM |
| `moneda` | GTQ / MXN / USD |
| `tipo_tasa` | PRESUPUESTO (P&L), CIERRE (balance), HISTORICA (capital social; solo en 2027-12) |
| `tasa_a_usd` | **USD por 1 unidad de moneda** |

| Moneda | V1 | V2 |
|---|---|---|
| GTQ | 1/7.80 = 0.12820513 | igual |
| MXN | 1/18.00 = 0.05555556 | 1/18.70 = 0.05347594 (el MXN se deprecia) |
| USD | 1 | 1 |

**Tasas locales** con que cada país registra lo facturado en otra moneda (están implícitas en los montos, no vienen en un archivo):
- GT: USD = 7.75 GTQ
- MX en V1: USD = 18.20 MXN y GTQ = 2.35 MXN
- MX en V2: USD = 18.90 MXN y GTQ = 2.42 MXN

---

## 3. Cargas (`datos/cargas_v1/`, `datos/cargas_v2/`)

Hay dos archivos por empresa y versión:
- `presupuesto_<EMP>_<V>.csv`: P&L mensual de 2027-01 a 2027-12.
- `balance_<EMP>_<V>.csv`: balance de cierre en 2027-12.

| Columna | Tipo | Obligatoria | Descripción |
|---|---|---|---|
| `empresa` | texto | sí | Empresa que carga |
| `escenario` | texto | sí | PPTO_V1 / PPTO_V2 |
| `periodo` | AAAA-MM | sí | |
| `cuenta_local` | texto | sí | Código del catálogo local del país |
| `descripcion` | texto | no | Informativa |
| `moneda` | texto | sí | Moneda **declarada**. Debe ser la funcional (V02) |
| `monto` | número | sí | En moneda funcional, siempre positivo |
| `socio_ic` | texto | si es IC | Empresa del grupo contraparte |
| `doc_ic_id` | texto | si es IC | Llave de conciliación compartida por ambas patas. Formato `IC-<flujo>-<periodo>`; los préstamos usan `IC-P1` |
| `moneda_tx` | texto | si es IC | Moneda en que se pactó el documento |
| `monto_tx` | número | si es IC | Monto en moneda de transacción: **debe ser igual en ambas patas** |
| `contraparte_id_fiscal` | texto | no | `VARIOS` para ventas a terceros; si coincide con el `id_fiscal` de una empresa del grupo → V13 |
| `volumen` | número | solo 4100 | Driver de volumen (para el explicador) |
| `precio` | número | solo 4100 | Driver de precio. Se cumple `monto = volumen × precio` |

**Flujos IC del dataset** (todos los meses, V1):

| Flujo | Emisor → Receptor | Tipo | Moneda | Monto/mes | Cuentas (emisor / receptor) |
|---|---|---|---|---:|---|
| F1 | GT1 → MX1 | Venta | GTQ | 65,000 | 4200 / 5200 |
| F2 | GT2 → GT1 | Venta | GTQ | 39,000 | 4200 / 5200 |
| F3 | MX1 → MX2 | Venta | MXN | 900,000 | 4200 / 5200 |
| F4 | US1 → GT2 | Venta | USD | 20,000 | 4200 / 5200 |
| F5a–e | US2 → GT1, GT2, MX1, MX2, US1 | Servicio de gestión | USD | 7,500 / 3,000 / 8,000 / 4,500 / 9,000 | 4300 / 6200 |
| F6 | US2 → MX1 | Intereses del préstamo P1 (8 % anual) | USD | 13,333.33 | 7300 / 7200 |
| P1 | US2 → MX1 | Préstamo (saldo) | USD | 2,000,000 | 1600 / 2250 |

En el balance, los saldos IC de cierre son los documentos de diciembre (1250 / 2150) más el préstamo P1.

**Cambios de V1 a V2** (para el explicador):
- El MXN pasa de 18.00 a 18.70 por USD.
- El volumen de MX1 sube 10 % (5,000 → 5,500).
- El precio de GT1 baja 3 % (1,950 → 1,891.50).
- El fee US2 → MX1 sube de 8,000 a 9,000 USD (se elimina, así que el impacto consolidado es 0).
- El WACC sube de 10 % a 11 %.

---

## 4. Salidas del oráculo (`resultados_referencia/`)

| Archivo | Llave para comparar | Contenido |
|---|---|---|
| `v1_con_errores_validacion_hallazgos.csv` | regla + registro | Lo que el validador debe encontrar |
| `v1_cobertura_errores_sembrados.csv` | código de error | Cruce contra la hoja de respuestas |
| `<v>_conciliacion_ic.csv` | doc_ic_id + estado_financiero | Estado de cada documento IC |
| `<v>_eliminaciones.csv` | elim_id | Asientos de eliminación (E1 ventas/servicios, E2 saldos, E3 préstamo, E4 intereses, E7 dif. FX) |
| `<v>_consolidado.csv` | cuenta_grupo | Agregado, eliminaciones, CTA, consolidado |
| `<v>_linaje.csv` | cuenta_grupo + origen_id | Cada aporte a cada cifra |
| `<v>_matriz_ic_facturado_usd.csv` / `_saldos_usd.csv` | emisor × receptor | Cuenta corriente IC |
| `<v>_kpis_grupo.csv` / `_kpis_por_empresa.csv` | vista / empresa | ROIC, ROCE, EVA y sus insumos |
| `comparativo_kpis.csv` | vista | Ingenuo vs sin eliminar vs consolidado |
| `bridge_v1_v2_detalle.csv` / `_eva.csv` | efecto + empresa + cuenta + periodo | Explicador |

Donde `<v>` es `v1_corregida` o `v2`.
