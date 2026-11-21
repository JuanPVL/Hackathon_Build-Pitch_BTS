# Hoja de respuestas — errores sembrados en V1

> ⚠️ No abrir hasta que el validador esté construido. La prueba es encontrarlos a ciegas.

| # | Regla | Empresa | Archivo | Qué está mal | Qué pasa si no se detecta |
|---|---|---|---|---|---|
| E01 | V08 | MXN | `tasas_grupo_V1.csv` | Tasa MXN PRESUPUESTO de 2027-05 cargada invertida: 18.0 en vez de 0.0556 | El P&L de mayo de MX1 y MX2 se multiplica x324 en USD |
| E02 | V09 | US1 | `presupuesto_US1_V1.csv` | Gastos operativos de 2027-07 en x1000 (60,000,000 en vez de 60,000) | EBIT del grupo cae ~USD 60M; ROIC/EVA absurdos |
| E03 | V02 | MX1 | `presupuesto_MX1_V1.csv` | 2 líneas de 2027-02 declaran moneda USD; MX1 presupuesta en MXN | Si se convierte como USD, gastos de febrero de MX1 se inflan x18 |
| E04 | V12 | MX1 | `presupuesto_MX1_V1.csv` | MX1 no registró la compra IC-F1-2027-11 a GT1 (GTQ 65,000): venta IC sin contraparte | No se puede eliminar limpio; costo de MX1 subestimado |
| E05 | V13 | MX1 | `presupuesto_MX1_V1.csv` | Venta de junio a MX2 (MXN 900,000) registrada como venta a tercero (contraparte RFC de MX2) | Doble conteo: USD 50,000 de ventas que no se eliminan |
| E06 | V03 | MX2 | `presupuesto_MX2_V1.csv` | Gasto operativo de 2027-09 en cuenta local GAS-OTR sin mapeo a cuenta de grupo | MXN 600,000 desaparecen del consolidado (EBIT sobrestimado) |
| E07 | V04 | US1 | `presupuesto_US1_V1.csv` | Ventas a terceros de 2027-04 duplicadas | Ventas del grupo infladas USD 300,000 |
| E08 | V05 | GT2 | `presupuesto_GT2_V1.csv` | GT2 no cargó el periodo 2027-03 (deja huérfanas IC-F2-2027-03, IC-F4-2027-03, IC-F5b-2027-03) | Falta un mes de GT2 y tres documentos IC quedan sin contraparte |
| E09 | V07 | GT1 | `presupuesto_GT1_V1.csv` | Ventas a terceros de 2027-08 con signo negativo | Ventas del grupo caen 2 x USD 250,000 |
| E10 | V06 | GT1 | `balance_GT1_V1.csv` | Inventario de cierre con GTQ 50,000 de más: Activo ≠ Pasivo + Patrimonio | Balance consolidado no cuadra; capital invertido mal |
| E11 | V11 | US2 | `presupuesto_US2_V1.csv` | US2 se factura a sí misma un servicio de gestión USD 5,000 (socio_ic = US2) | Ingreso ficticio USD 5,000 |
| E12 | V10 | GT2 | `presupuesto_GT2_V1.csv` | Venta IC de 2027-05 (doc IC-F2-2027-05) sin socio_ic | No se sabe contra quién eliminar |
| E13 | V14 | US2/MX2 | `presupuesto_US2_V1.csv + presupuesto_MX2_V1.csv` | Fee de gestión US2→MX2 de USD 12,000/mes = 8 % de ventas de MX2; la política TP-MGMT permite 2 %–5 % | Riesgo fiscal de precios de transferencia (consolidado no cambia porque se elimina) |
| E14 | V18 | GT2 | `presupuesto_GT2_V1.csv` | GT2 registra IC-F4-2027-12 (USD 20,000 de US1) en 2027-11: diferencia de corte | Noviembre y diciembre no concilian entre US1 y GT2 |

## Hallazgos esperados del validador (20)

Un error puede producir más de un síntoma. Estos son **todos** los hallazgos que debe dar un validador correcto sobre V1, ordenados por severidad e impacto:

| Regla | Sev | Empresa | Registro | Mensaje | Impacto USD |
|---|---|---|---|---|---:|
| V14 | A | US2→MX2 | `TP-MGMT` | Fee de gestión US2→MX2 = 8.0% de ventas de MX2; política 2%–5% | 54,000 |
| V18 | A | GT2 | `presupuesto_GT2_V1.csv#fila87` | IC-F4-2027-12: emisor US1 lo registra en 2027-12, receptor GT2 en 2027-11 (corte) | 20,000 |
| V08 | B | MXN | `tasas 2027-05 PRESUPUESTO` | Tasa MXN PRESUPUESTO 2027-05 fuera de banda (parece invertida: 1/x ≈ mediana) | 285,964,670 |
| V09 | B | US1 | `presupuesto_US1_V1.csv#fila46` | 6000 2027-07 es 1,000x la mediana de la cuenta (¿miles vs unidades?) | 59,940,000 |
| V02 | B | MX1 | `presupuesto_MX1_V1.csv#fila13` | Moneda declarada USD ≠ moneda funcional MXN | 850,000 |
| V07 | B | GT1 | `presupuesto_GT1_V1.csv#fila58` | Monto negativo en 4.1.01 (Ventas a terceros) | 500,000 |
| V04 | B | US1 | `presupuesto_US1_V1.csv#fila86` | Línea duplicada (4000 2027-04) | 300,000 |
| V05 | B | GT2 | `presupuesto_GT2` | Periodo 2027-03 sin ninguna línea | 128,205 |
| V02 | B | MX1 | `presupuesto_MX1_V1.csv#fila14` | Moneda declarada USD ≠ moneda funcional MXN | 56,667 |
| V12 | B | MX2/MX1 | `presupuesto_MX2_V1.csv#fila30` | IC-F3-2027-06: solo existe la pata del receptor (compra); falta el espejo en MX1 | 50,000 |
| V13 | B | MX1 | `presupuesto_MX1_V1.csv#fila52` | Registrado en cuenta de terceros (VTA-NAC) pero la contraparte RFC-GMX020202 es MX2 (grupo) | 50,000 |
| V03 | B | MX2 | `presupuesto_MX2_V1.csv#fila44` | Cuenta local 'GAS-OTR' sin mapeo a cuenta de grupo | 33,333 |
| V12 | B | US1/GT2 | `presupuesto_US1_V1.csv#fila20` | IC-F4-2027-03: solo existe la pata del emisor (venta); falta el espejo en GT2 | 20,000 |
| V12 | B | GT1/MX1 | `presupuesto_GT1_V1.csv#fila86` | IC-F1-2027-11: solo existe la pata del emisor (venta); falta el espejo en MX1 | 8,333 |
| V06 | B | GT1 | `balance_GT1 2027-12` | Activo 32,565,000.00 ≠ Pasivo+Patrimonio 32,515,000.00 | 6,410 |
| V10 | B | GT2 | `presupuesto_GT2_V1.csv#fila30` | Cuenta IC 4.1.02 sin socio_ic (doc IC-F2-2027-05) | 5,000 |
| V11 | B | US2 | `presupuesto_US2_V1.csv#fila98` | Autofacturación: socio_ic = US2 | 5,000 |
| V12 | B | GT1/GT2 | `presupuesto_GT1_V1.csv#fila23` | IC-F2-2027-03: solo existe la pata del receptor (compra); falta el espejo en GT2 | 5,000 |
| V12 | B | US2/US2 | `presupuesto_US2_V1.csv#fila98` | IC-F5x-2027-01: solo existe la pata del emisor (venta); falta el espejo en US2 | 5,000 |
| V12 | B | US2/GT2 | `presupuesto_US2_V1.csv#fila20` | IC-F5b-2027-03: solo existe la pata del emisor (venta); falta el espejo en GT2 | 3,000 |

**Derivados** (correctos, no son falsos positivos):
- E08 (falta marzo en GT2) → 3 × V12: IC-F2-2027-03, IC-F4-2027-03 e IC-F5b-2027-03 quedan con una sola pata.
- E05 (venta IC como tercero) → V13 en MX1 **y** V12 en MX2: la compra de MX2 queda sin espejo.
- E11 (autofacturación) → V11 **y** V12: el documento no tiene receptor distinto.

**Criterio de aceptación:** 14/14 detectados, 0 falsos positivos sobre V1 corregida y V2.

Para regenerar: `python referencia/generar_datos.py && python referencia/motor_referencia.py`. Los errores se siembran en la función `sembrar()` de `generar_datos.py`. Ahí se agregan nuevos.
