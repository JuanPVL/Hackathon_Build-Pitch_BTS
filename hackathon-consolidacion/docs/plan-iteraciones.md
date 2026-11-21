# Plan de iteraciones

Cada iteración termina con una **prueba contra el oráculo** (`resultados_referencia/`). Si no pasa, no se avanza.

Stack: Supabase (PostgreSQL, funciones, RLS, Storage para archivos) + React. La lógica de negocio vive en **SQL/funciones** para que sea auditable. React solo muestra datos y dispara acciones.

---

## It-0 · Base lista (½ día)
**Objetivo:** el esquema y los datos viven en Supabase.
- Ejecutar `supabase/01..04`.
- Pantalla mínima en React que liste las cargas y su estado.

**Prueba:** con V2 aprobada, `v_agregado` = columna `agregado` de `v2_consolidado.csv` (±1 USD por cuenta).

---

## It-1 · Carga de archivos (½ día)
**Objetivo:** subir un CSV/Excel y que quede en `carga` + `linea_carga`, con `linea_id = archivo#filaN` y hash del archivo.
- Mapeo de columnas configurable: si el archivo trae otros nombres, se mapean sin tocar código. Es el seguro por si el organizador manda otro formato.
- Si se sube un archivo con el mismo hash que uno anterior, se avisa (V19).

**Prueba:** subir los 24 archivos de `datos/` desde la UI y obtener los mismos 1,209 registros que dejan los seeds.

---

## It-2 · Validador (1 día) ← el corazón de la demo
**Objetivo:** función `fn_validar(escenario)` que llena `hallazgo_validacion` y mueve cada carga a `CUARENTENA`, `PENDIENTE_APROBACION` o `APROBADA`.
- Implementar en este orden (por impacto): V08, V09, V02, V07, V04, V05, V03, V06, V10, V11, V12, V13, V14, V18, V20.
- `impacto_usd` en cada hallazgo, calculado con la **mediana** de las tasas (para no usar la tasa equivocada en el estimado).
- Las advertencias (A) requieren justificación para aprobar.

**Prueba:**
- V1 con errores → mismos 20 hallazgos que `v1_con_errores_validacion_hallazgos.csv` (regla + registro).
- V1 corregida y V2 → 0 hallazgos.
- Cobertura 14/14 contra `_respuestas/errores_sembrados.csv`. **Recién aquí se abre `_respuestas/`.**

---

## It-3 · Intercompany: pares, matriz y cuenta corriente (1 día)
**Objetivo:** responder "¿cuánto le facturé a X, cuánto me facturó, cuál es el saldo?".
- `fn_conciliar(corrida)` llena `conciliacion_ic` con estados CONCILIADO / CONCILIADO_FX / FX_FUERA_TOLERANCIA / DIFERENCIA_MONTO / DIFERENCIA_CORTE / SIN_CONTRAPARTE.
- Pantalla con la matriz 6×6; click → documentos → las dos patas lado a lado.
- Flujo transaccional (para la demo de CxC/CxP): emitir un `documento_ic` → el trigger crea la CxC y la CxP espejo → el receptor acepta o disputa.

**Prueba:** `v1_corregida_conciliacion_ic.csv` (39 CONCILIADO + 92 CONCILIADO_FX) y las dos matrices `*_matriz_ic_*`.

---

## It-4 · Consolidación + eliminaciones + linaje (1 día)
**Objetivo:** `fn_consolidar(escenario)` crea una `corrida` inmutable y llena `eliminacion`, `consolidado` y `linaje`.
- Elimina **solo lo conciliado**. Lo no conciliado queda visible como IC no eliminado.
- La diferencia FX de cada documento va a 7900 (P&L) o 3900 (balance), y el CTA cuadra el balance.
- Prueba de integridad automática: Σ linaje = consolidado. Si falla, la corrida se marca `linaje_ok = false`.

**Prueba:** `v1_corregida_consolidado.csv` y `v2_consolidado.csv` cuenta por cuenta. `v1_corregida_eliminaciones.csv` por elim_id.

---

## It-5 · KPIs calculados (½ día)
**Objetivo:** vistas `v_kpi_grupo` y `v_kpi_empresa` completas (NOPAT, ROIC, ROCE, EVA) más su árbol de cálculo navegable hasta `linea_id`.
- Mostrar "sin eliminar" vs "consolidado" lado a lado.

**Prueba:** `v1_corregida_kpis_grupo.csv`, `v2_kpis_grupo.csv` y `*_kpis_por_empresa.csv`.

---

## It-6 · Explicador de desviaciones (1 día)
**Objetivo:** `fn_bridge(corrida_a, corrida_b)` que descompone la variación en tipo de cambio, volumen, precio, costo, gasto e IC (neutral), y el EVA en EBIT, tasa de impuesto, WACC y capital.
- La suma de los efectos debe ser **exacta**.
- Narrativa: plantilla determinística primero. Después, opcionalmente, Claude redacta sobre el JSON del bridge con un post-validador que rechaza cualquier número que no esté en el JSON.

**Prueba:** `bridge_v1_v2_detalle.csv` agregado por efecto (Δ EBIT +48,599) y `bridge_v1_v2_eva.csv` (Δ EVA −94,982).

---

## It-7 · Demo (½ día)
- Pantalla "antes y después": el consolidado ingenuo (ventas USD 159M, EBIT −41M) contra el consolidado del motor (ventas 12.94M, EBIT 2.36M) sobre los mismos archivos.
- Guion de 8 minutos de la §13 de la especificación, ensayado con cronómetro.
- Que alguien de finanzas ajeno al equipo lo vea y diga si entiende cada cifra sin ayuda.

---

## Backlog para después del P0
- V15 outliers estadísticos, V16 subtotales, V17 insumos de KPI inválidos, V19 hash repetido.
- E6: margen no realizado en inventario IC.
- Netting multilateral.
- Balance de apertura, para usar promedios en ROIC/ROCE.
- Más errores sembrados en `generar_datos.py`: contraparte errónea (A dice que le vendió a B, pero la CxP la tiene C) y moneda de transacción distinta entre las dos patas.
