# Reporte del motor de referencia

Generado por `referencia/motor_referencia.py`. Todas las cifras en USD. Estos son los **resultados esperados**: lo que construyan debe dar lo mismo.

## 1. Validador sobre V1 con errores

- Hallazgos totales: **20** (18 bloqueantes, 2 advertencias)
- Errores sembrados detectados: **14 de 14**

| Error | Regla | Empresa | ¿Detectado? | Impacto USD | Descripción |
|---|---|---|---|---:|---|
| E01 | V08 | MXN | SÍ | 285,964,670 | Tasa MXN PRESUPUESTO de 2027-05 cargada invertida: 18.0 en vez de 0.0556 |
| E02 | V09 | US1 | SÍ | 59,940,000 | Gastos operativos de 2027-07 en x1000 (60,000,000 en vez de 60,000) |
| E03 | V02 | MX1 | SÍ | 906,667 | 2 líneas de 2027-02 declaran moneda USD; MX1 presupuesta en MXN |
| E04 | V12 | MX1 | SÍ | 58,333 | MX1 no registró la compra IC-F1-2027-11 a GT1 (GTQ 65,000): venta IC sin contraparte |
| E05 | V13 | MX1 | SÍ | 50,000 | Venta de junio a MX2 (MXN 900,000) registrada como venta a tercero (contraparte RFC de MX2) |
| E06 | V03 | MX2 | SÍ | 33,333 | Gasto operativo de 2027-09 en cuenta local GAS-OTR sin mapeo a cuenta de grupo |
| E07 | V04 | US1 | SÍ | 300,000 | Ventas a terceros de 2027-04 duplicadas |
| E08 | V05 | GT2 | SÍ | 128,205 | GT2 no cargó el periodo 2027-03 (deja huérfanas IC-F2-2027-03, IC-F4-2027-03, IC-F5b-2027-03) |
| E09 | V07 | GT1 | SÍ | 500,000 | Ventas a terceros de 2027-08 con signo negativo |
| E10 | V06 | GT1 | SÍ | 6,410 | Inventario de cierre con GTQ 50,000 de más: Activo ≠ Pasivo + Patrimonio |
| E11 | V11 | US2 | SÍ | 5,000 | US2 se factura a sí misma un servicio de gestión USD 5,000 (socio_ic = US2) |
| E12 | V10 | GT2 | SÍ | 5,000 | Venta IC de 2027-05 (doc IC-F2-2027-05) sin socio_ic |
| E13 | V14 | US2/MX2 | SÍ | 54,000 | Fee de gestión US2→MX2 de USD 12,000/mes = 8 % de ventas de MX2; la política TP-MGMT permite 2 %–5 % |
| E14 | V18 | GT2 | SÍ | 20,000 | GT2 registra IC-F4-2027-12 (USD 20,000 de US1) en 2027-11: diferencia de corte |

Top 10 hallazgos por impacto (así debe ordenarlos su validador):

| # | Regla | Sev | Empresa | Registro | Mensaje | Impacto USD |
|---|---|---|---|---|---|---:|
| 1 | V08 | B | MXN | `tasas 2027-05 PRESUPUESTO` | Tasa MXN PRESUPUESTO 2027-05 fuera de banda (parece invertida: 1/x ≈ mediana) | 285,964,670 |
| 2 | V09 | B | US1 | `presupuesto_US1_V1.csv#fila46` | 6000 2027-07 es 1,000x la mediana de la cuenta (¿miles vs unidades?) | 59,940,000 |
| 3 | V02 | B | MX1 | `presupuesto_MX1_V1.csv#fila13` | Moneda declarada USD ≠ moneda funcional MXN | 850,000 |
| 4 | V07 | B | GT1 | `presupuesto_GT1_V1.csv#fila58` | Monto negativo en 4.1.01 (Ventas a terceros) | 500,000 |
| 5 | V04 | B | US1 | `presupuesto_US1_V1.csv#fila86` | Línea duplicada (4000 2027-04) | 300,000 |
| 6 | V05 | B | GT2 | `presupuesto_GT2` | Periodo 2027-03 sin ninguna línea | 128,205 |
| 7 | V02 | B | MX1 | `presupuesto_MX1_V1.csv#fila14` | Moneda declarada USD ≠ moneda funcional MXN | 56,667 |
| 8 | V14 | A | US2→MX2 | `TP-MGMT` | Fee de gestión US2→MX2 = 8.0% de ventas de MX2; política 2%–5% | 54,000 |
| 9 | V13 | B | MX1 | `presupuesto_MX1_V1.csv#fila52` | Registrado en cuenta de terceros (VTA-NAC) pero la contraparte RFC-GMX020202 es MX2 (grupo) | 50,000 |
| 10 | V12 | B | MX2/MX1 | `presupuesto_MX2_V1.csv#fila30` | IC-F3-2027-06: solo existe la pata del receptor (compra); falta el espejo en MX1 | 50,000 |

> Hay hallazgos **derivados** (p. ej. E08 deja 3 documentos IC sin contraparte → V12). Son correctos: un error produce varios síntomas. El listado completo está en `v1_con_errores_validacion_hallazgos.csv`.

## 2. Cargas limpias pasan el validador

- V1 corregida: 0 bloqueantes, 0 advertencias
- V2: 0 bloqueantes, 0 advertencias

## 3. Antes y después (el impacto en una tabla)

| Vista | Ventas | EBIT | Capital invertido | Capital empleado | ROIC | ROCE | EVA |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ingenuo (Excel, V1 con errores) | 158,955,257 | -41,491,120 | 15,154,000 | 20,459,128 | -191.91% | -202.80% | -30,596,903 |
| Motor sin eliminar (V1 corregida) | 13,938,462 | 2,359,154 | 15,147,590 | 20,452,718 | 11.56% | 11.53% | 236,307 |
| Motor consolidado (V1 corregida) | 12,938,462 | 2,360,308 | 15,147,834 | 18,452,962 | 11.57% | 12.79% | 237,139 |
| Motor consolidado (V2) | 12,957,553 | 2,408,907 | 14,943,212 | 18,223,385 | 11.95% | 13.22% | 142,157 |

- **Ingenuo**: lo que sale hoy sumando los Excel con errores, sin validar ni eliminar.
- **Sin eliminar**: datos ya correctos, pero sin quitar las operaciones entre empresas → ventas y activos inflados.
- **Consolidado**: la cifra correcta del grupo.

## 4. Consolidado V1 corregida

| Cuenta | Nombre | Agregado | Eliminaciones | CTA | Consolidado |
|---|---|---:|---:|---:|---:|
| 1100 | Efectivo | 3,305,128 | 0 | 0 | **3,305,128** |
| 1200 | Cuentas por cobrar terceros | 1,078,205 | 0 | 0 | **1,078,205** |
| 1250 | Cuentas por cobrar IC | 128,667 | -128,667 | 0 | **0** |
| 1300 | Inventario | 1,335,897 | 0 | 0 | **1,335,897** |
| 1500 | Activo fijo neto | 13,058,975 | 0 | 0 | **13,058,975** |
| 1600 | Préstamo IC por cobrar | 2,000,000 | -2,000,000 | 0 | **0** |
| 2100 | Cuentas por pagar terceros | 325,244 | 0 | 0 | **325,244** |
| 2150 | Cuentas por pagar IC | 128,911 | -128,911 | 0 | **0** |
| 2200 | Deuda financiera largo plazo | 3,115,385 | 0 | 0 | **3,115,385** |
| 2250 | Préstamo IC por pagar | 2,022,222 | -2,022,222 | 0 | **0** |
| 3100 | Capital social | 9,303,526 | 0 | 0 | **9,303,526** |
| 3200 | Utilidades retenidas | 6,169,811 | 0 | 0 | **6,169,811** |
| 3900 | Ajuste acumulado por conversión (CTA) | 0 | 22,467 | -158,227 | **-135,760** |
| 4100 | Ventas a terceros | 12,938,462 | 0 | 0 | **12,938,462** |
| 4200 | Ventas intercompany | 1,000,000 | -1,000,000 | 0 | **0** |
| 4300 | Ingresos por servicios de gestión IC | 384,000 | -384,000 | 0 | **0** |
| 5100 | Costo de ventas terceros | 7,805,846 | 0 | 0 | **7,805,846** |
| 5200 | Compras / costo intercompany | 1,000,295 | -1,000,295 | 0 | **0** |
| 6100 | Gastos operativos | 2,772,308 | 0 | 0 | **2,772,308** |
| 6200 | Servicios de gestión IC (gasto) | 384,859 | -384,859 | 0 | **0** |
| 7100 | Gasto financiero terceros | 114,462 | 0 | 0 | **114,462** |
| 7200 | Intereses IC (gasto) | 161,778 | -161,778 | 0 | **0** |
| 7300 | Intereses IC (ingreso) | 160,000 | -160,000 | 0 | **0** |
| 7900 | Diferencia cambiaria IC (solo consolidación) | 0 | 2,932 | 0 | **2,932** |
| 8100 | Impuesto sobre la renta | 650,225 | 0 | 0 | **650,225** |

- Documentos IC conciliados: {'CONCILIADO_FX': 92, 'CONCILIADO': 39}
- Prueba de integridad del linaje (Σ aportes = consolidado): **OK** (V2: OK)

## 5. Matriz IC V1 corregida — facturado anual (fila factura a columna), USD

| Emisor \ Receptor | GT1 | GT2 | MX1 | MX2 | US1 |
|---|---:|---:|---:|---:|---:|
| GT1 | 0 | 0 | 100,000 | 0 | 0 |
| GT2 | 60,000 | 0 | 0 | 0 | 0 |
| MX1 | 0 | 0 | 0 | 600,000 | 0 |
| US1 | 0 | 240,000 | 0 | 0 | 0 |
| US2 | 90,000 | 36,000 | 256,000 | 54,000 | 108,000 |

Saldos IC al cierre (+ me deben / − les debo), USD. Debe ser antisimétrica salvo diferencia FX:

| Empresa \ Socio | GT1 | GT2 | MX1 | MX2 | US1 | US2 |
|---|---:|---:|---:|---:|---:|---:|
| GT1 | 0 | -5,000 | 8,333 | 0 | 0 | -7,452 |
| GT2 | 5,000 | 0 | 0 | 0 | -19,872 | -2,981 |
| MX1 | -8,486 | 0 | 0 | 50,000 | 0 | -2,043,793 |
| MX2 | 0 | 0 | -50,000 | 0 | 0 | -4,550 |
| US1 | 0 | 20,000 | 0 | 0 | 0 | -9,000 |
| US2 | 7,500 | 3,000 | 2,021,333 | 4,500 | 9,000 | 0 |

## 6. KPIs por empresa (V1 corregida, stand-alone en USD)

| Empresa | EBIT | Capital invertido | ROIC | ROCE | EVA |
|---|---:|---:|---:|---:|---:|
| GT1 | 689,038 | 3,696,522 | 13.98% | 16.88% | 147,127 |
| GT2 | 139,615 | 1,339,840 | 7.82% | 9.35% | -29,272 |
| MX1 | 1,061,100 | 3,864,110 | 19.22% | 24.63% | 356,359 |
| MX2 | -334,600 | 1,883,783 | -12.43% | -15.89% | -422,598 |
| US1 | 780,000 | 4,118,000 | 14.96% | 16.53% | 204,400 |
| US2 | 24,000 | 245,333 | 7.73% | 0.64% | -5,573 |

## 7. Explicador V1 → V2

Ventas consolidadas: 12,938,462 → 12,957,553 (Δ 19,091)

| Efecto | Δ Ventas | Δ EBIT |
|---|---:|---:|
| Costo de ventas (operativo) | 0 | -120,000 |
| Precio | -90,000 | -90,000 |
| Tipo de cambio | -190,909 | -41,401 |
| Volumen | 300,000 | 300,000 |
| **Total** | **19,091** | **48,599** |

Control: Δ Ventas real = 19,091; Δ EBIT real = 48,599

Por empresa (top causas de Δ EBIT):

| Efecto | Empresa | Δ EBIT |
|---|---|---:|
| Volumen | MX1 | 300,000 |
| Costo de ventas (operativo) | MX1 | -174,000 |
| Precio | GT1 | -90,000 |
| Costo de ventas (operativo) | GT1 | 54,000 |
| Tipo de cambio | MX1 | -29,422 |
| Tipo de cambio | MX2 | -11,979 |

El fee de gestión US2→MX1 sube de USD 8,000 a 9,000/mes: el ingreso de US2 y el gasto de MX1 se mueven juntos (neto en el agregado: 826 por diferencia cambiaria) y la eliminación lo deja en **0 en el consolidado**.

EVA: 237,139 → 142,157 (Δ -94,982)

| Efecto | Δ EVA |
|---|---:|
| EBIT operativo (después de impuestos) | 36,072 |
| Tasa de impuesto efectiva (mezcla de países) | -2,084 |
| Parámetro WACC | -149,432 |
| Capital invertido | 20,462 |
| **Total** | **-94,982** |

### Texto que el explicador debería producir (plantilla determinística)

> **El EBIT consolidado subió USD 48,599 de V1 a V2.** 1) Volumen: USD 300,000. 2) Costo de ventas (operativo): USD -120,000. 3) Precio: USD -90,000. El aumento del fee de gestión US2→MX1 no afecta al grupo porque se elimina. El EVA cambia USD -94,982, de los cuales USD -149,432 se deben a subir el WACC de 10% a 11%.
