"""
Generador del grupo ficticio "Grupo Demo" para el hackathon.
Produce:
  datos/maestros/*            catálogos (empresas, monedas, cuentas, mapeo, parámetros, políticas TP)
  datos/tasas/*               tasas de grupo V1 (con error sembrado) y V2
  datos/cargas_v1/*           presupuesto + balance por empresa CON errores sembrados
  datos/cargas_v2/*           presupuesto + balance V2 (limpio, con cambios de negocio)
  _respuestas/cargas_v1_corregidas/*  la verdad: V1 sin errores
  _respuestas/tasas_grupo_V1_corregida.csv
  _respuestas/errores_sembrados.csv
Uso: python generar_datos.py  (desde la carpeta referencia/)
Determinístico: siempre produce los mismos números.
"""
import copy, csv, os

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ANIO = 2027
PERIODOS = [f"{ANIO}-{m:02d}" for m in range(1, 13)]

# ---------------------------------------------------------------- maestros
EMPRESAS = [
    # id, nombre, pais, moneda, id_fiscal, tasa_isr
    ("GT1", "Alfa Guatemala, S.A.", "GT", "GTQ", "NIT-1000001", 0.25),
    ("GT2", "Beta Guatemala, S.A.", "GT", "GTQ", "NIT-1000002", 0.25),
    ("MX1", "Alfa México, S.A. de C.V.", "MX", "MXN", "RFC-AMX010101", 0.30),
    ("MX2", "Gamma México, S.A. de C.V.", "MX", "MXN", "RFC-GMX020202", 0.30),
    ("US1", "Alfa USA, Inc.", "US", "USD", "EIN-11-1111111", 0.21),
    ("US2", "Delta Holding USA, Inc.", "US", "USD", "EIN-22-2222222", 0.21),
]
EMP = {e[0]: dict(nombre=e[1], pais=e[2], moneda=e[3], id_fiscal=e[4], isr=e[5]) for e in EMPRESAS}

MONEDAS = [("GTQ", "Quetzal guatemalteco", 2), ("MXN", "Peso mexicano", 2), ("USD", "Dólar estadounidense", 2)]

# cuenta_grupo, nombre, tipo, rubro, es_ic, contraparte_ic, corriente
CUENTAS = [
    ("4100", "Ventas a terceros", "ING", "VENTAS", 0, "", ""),
    ("4200", "Ventas intercompany", "ING", "VENTAS", 1, "5200", ""),
    ("4300", "Ingresos por servicios de gestión IC", "ING", "OTROS_ING_OP", 1, "6200", ""),
    ("5100", "Costo de ventas terceros", "GAS", "COSTO", 0, "", ""),
    ("5200", "Compras / costo intercompany", "GAS", "COSTO", 1, "4200", ""),
    ("6100", "Gastos operativos", "GAS", "GASTO_OP", 0, "", ""),
    ("6200", "Servicios de gestión IC (gasto)", "GAS", "GASTO_OP", 1, "4300", ""),
    ("7100", "Gasto financiero terceros", "GAS", "FINANCIERO", 0, "", ""),
    ("7200", "Intereses IC (gasto)", "GAS", "FINANCIERO", 1, "7300", ""),
    ("7300", "Intereses IC (ingreso)", "ING", "FINANCIERO", 1, "7200", ""),
    ("7900", "Diferencia cambiaria IC (solo consolidación)", "GAS", "FINANCIERO", 0, "", ""),
    ("8100", "Impuesto sobre la renta", "GAS", "ISR", 0, "", ""),
    ("1100", "Efectivo", "ACT", "EFECTIVO", 0, "", "S"),
    ("1200", "Cuentas por cobrar terceros", "ACT", "CTO", 0, "", "S"),
    ("1250", "Cuentas por cobrar IC", "ACT", "CTO", 1, "2150", "S"),
    ("1300", "Inventario", "ACT", "CTO", 0, "", "S"),
    ("1500", "Activo fijo neto", "ACT", "AF", 0, "", "N"),
    ("1600", "Préstamo IC por cobrar", "ACT", "PRESTAMO_IC", 1, "2250", "N"),
    ("2100", "Cuentas por pagar terceros", "PAS", "CTO", 0, "", "S"),
    ("2150", "Cuentas por pagar IC", "PAS", "CTO", 1, "1250", "S"),
    ("2200", "Deuda financiera largo plazo", "PAS", "DEUDA", 0, "", "N"),
    ("2250", "Préstamo IC por pagar", "PAS", "PRESTAMO_IC", 1, "1600", "N"),
    ("3100", "Capital social", "PAT", "PATRIMONIO", 0, "", ""),
    ("3200", "Utilidades retenidas", "PAT", "PATRIMONIO", 0, "", ""),
    ("3900", "Ajuste acumulado por conversión (CTA)", "PAT", "PATRIMONIO", 0, "", ""),
]

LOCAL = {  # cuenta_grupo -> código local por país
    "GT": {"4100": "4.1.01", "4200": "4.1.02", "4300": "4.1.03", "5100": "5.1.01", "5200": "5.1.02",
           "6100": "6.1.01", "6200": "6.1.02", "7100": "7.1.01", "7200": "7.1.02", "7300": "7.1.03",
           "8100": "8.1.01", "1100": "1.1.01", "1200": "1.2.01", "1250": "1.2.02", "1300": "1.3.01",
           "1500": "1.5.01", "1600": "1.6.01", "2100": "2.1.01", "2150": "2.1.02", "2200": "2.2.01",
           "2250": "2.2.02", "3100": "3.1.01", "3200": "3.2.01"},
    "MX": {"4100": "VTA-NAC", "4200": "VTA-IC", "4300": "ING-SRV-IC", "5100": "CV-NAC", "5200": "CV-IC",
           "6100": "GAS-OPE", "6200": "GAS-SRV-IC", "7100": "GF-BAN", "7200": "GF-IC", "7300": "IF-IC",
           "8100": "ISR", "1100": "BAN", "1200": "CXC-NAC", "1250": "CXC-IC", "1300": "INV",
           "1500": "AF-NETO", "1600": "PRE-IC-COB", "2100": "CXP-NAC", "2150": "CXP-IC", "2200": "DEU-BAN",
           "2250": "PRE-IC-PAG", "3100": "CAP", "3200": "UTR"},
    "US": {"4100": "4000", "4200": "4010", "4300": "4020", "5100": "5000", "5200": "5010", "6100": "6000",
           "6200": "6010", "7100": "7000", "7200": "7010", "7300": "7020", "8100": "8000", "1100": "1000",
           "1200": "1100", "1250": "1110", "1300": "1200", "1500": "1500", "1600": "1600", "2100": "2000",
           "2150": "2010", "2200": "2200", "2250": "2210", "3100": "3000", "3200": "3100"},
}
NOMBRE_CTA = {c[0]: c[1] for c in CUENTAS}

def loc(emp, cta):
    return LOCAL[EMP[emp]["pais"]][cta]

# ---------------------------------------------------------------- tasas
# tasa_a_usd = cuántos USD vale 1 unidad de la moneda
TASAS_V1 = {"GTQ": {"PRESUPUESTO": 1 / 7.80, "CIERRE": 1 / 7.80, "HISTORICA": 1 / 7.69},
            "MXN": {"PRESUPUESTO": 1 / 18.00, "CIERRE": 1 / 18.00, "HISTORICA": 1 / 17.00},
            "USD": {"PRESUPUESTO": 1.0, "CIERRE": 1.0, "HISTORICA": 1.0}}
TASAS_V2 = copy.deepcopy(TASAS_V1)
TASAS_V2["MXN"]["PRESUPUESTO"] = 1 / 18.70
TASAS_V2["MXN"]["CIERRE"] = 1 / 18.70

# tasas LOCALES con que cada país registra en su moneda funcional lo que se factura en otra moneda
# (difieren a propósito de la tasa de grupo -> genera diferencia cambiaria IC realista)
TASA_LOCAL_V1 = {("GT", "USD"): 7.75, ("MX", "USD"): 18.20, ("MX", "GTQ"): 2.35}
TASA_LOCAL_V2 = {("GT", "USD"): 7.75, ("MX", "USD"): 18.90, ("MX", "GTQ"): 2.42}  # MX actualiza su tasa en V2
TASA_LOCAL = dict(TASA_LOCAL_V1)

def a_local(emp, moneda_tx, monto_tx):
    pais, func = EMP[emp]["pais"], EMP[emp]["moneda"]
    if moneda_tx == func:
        return monto_tx
    return monto_tx * TASA_LOCAL[(pais, moneda_tx)]

# ---------------------------------------------------------------- parámetros de negocio
# volumen y precio mensual de ventas a terceros, % costo, gastos, balance de cierre (moneda local)
NEG_V1 = {
    "GT1": dict(vol=1000, precio=1950, costo=0.60, gasto=300_000, gf=20_000, ef=3_000_000, inv=2_500_000,
                af=25_000_000, deuda=8_000_000, capital=10_000_000),
    "GT2": dict(vol=400, precio=2500, costo=0.62, gasto=150_000, gf=5_000, ef=1_200_000, inv=900_000,
                af=9_000_000, deuda=2_000_000, capital=5_000_000),
    "MX1": dict(vol=5000, precio=900, costo=0.58, gasto=900_000, gf=60_000, ef=8_000_000, inv=6_000_000,
                af=60_000_000, deuda=15_000_000, capital=20_000_000),
    "MX2": dict(vol=3000, precio=900, costo=0.60, gasto=600_000, gf=0, ef=4_000_000, inv=3_000_000,
                af=30_000_000, deuda=0, capital=20_000_000),
    "US1": dict(vol=2000, precio=150, costo=0.62, gasto=60_000, gf=3_000, ef=600_000, inv=400_000,
                af=3_500_000, deuda=1_000_000, capital=2_000_000),
    "US2": dict(vol=0, precio=0, costo=0.0, gasto=30_000, gf=0, ef=1_500_000, inv=0,
                af=200_000, deuda=0, capital=3_000_000),
}
NEG_V2 = copy.deepcopy(NEG_V1)
NEG_V2["MX1"]["vol"] = 5500         # +10 % volumen MX1
NEG_V2["GT1"]["precio"] = 1891.50   # -3 % precio GT1

# flujos IC mensuales: id, tipo, emisor, receptor, moneda_tx, monto_tx, cuenta emisor, cuenta receptor
FLUJOS_V1 = [
    ("F1", "VENTA", "GT1", "MX1", "GTQ", 65_000, "4200", "5200"),
    ("F2", "VENTA", "GT2", "GT1", "GTQ", 39_000, "4200", "5200"),
    ("F3", "VENTA", "MX1", "MX2", "MXN", 900_000, "4200", "5200"),
    ("F4", "VENTA", "US1", "GT2", "USD", 20_000, "4200", "5200"),
    ("F5a", "SERVICIO", "US2", "GT1", "USD", 7_500, "4300", "6200"),
    ("F5b", "SERVICIO", "US2", "GT2", "USD", 3_000, "4300", "6200"),
    ("F5c", "SERVICIO", "US2", "MX1", "USD", 8_000, "4300", "6200"),
    ("F5d", "SERVICIO", "US2", "MX2", "USD", 4_500, "4300", "6200"),
    ("F5e", "SERVICIO", "US2", "US1", "USD", 9_000, "4300", "6200"),
    ("F6", "INTERES", "US2", "MX1", "USD", round(2_000_000 * 0.08 / 12, 2), "7300", "7200"),
]
FLUJOS_V2 = [list(f) for f in FLUJOS_V1]
for f in FLUJOS_V2:
    if f[0] == "F5c":
        f[5] = 9_000                 # fee US2->MX1 sube (debe eliminarse: impacto consolidado 0)
FLUJOS_V2 = [tuple(f) for f in FLUJOS_V2]
PRESTAMOS = [("P1", "US2", "MX1", "USD", 2_000_000)]

PARAMETROS_V1 = [("WACC", 0.10, "Costo promedio ponderado de capital del grupo"),
                 ("TOLERANCIA_FX_USD", 50, "Diferencia FX absoluta por documento IC que siempre se acepta"),
                 ("TOLERANCIA_FX_PCT", 0.02, "Diferencia FX relativa por documento IC aceptada (se cumple USD o %)"),
                 ("UMBRAL_ESCALA", 10, "Veces sobre la mediana de la cuenta para alertar error de escala"),
                 ("BANDA_TASA_PCT", 0.25, "Variación máxima de una tasa vs su mediana del año")]
PARAMETROS_V2 = [("WACC", 0.11, PARAMETROS_V1[0][2])] + PARAMETROS_V1[1:]

POLITICAS_TP = [("TP-MGMT", "SERVICIO", "Servicios de gestión: % sobre ventas a terceros del receptor", 0.02, 0.05)]

# ---------------------------------------------------------------- construcción de cargas
COLS_P = ["empresa", "escenario", "periodo", "cuenta_local", "descripcion", "moneda", "monto",
          "socio_ic", "doc_ic_id", "moneda_tx", "monto_tx", "contraparte_id_fiscal", "volumen", "precio"]

def linea(emp, esc, per, cta, monto, socio="", doc="", mtx="", montotx="", cpf="", vol="", precio="", desc=None):
    return dict(empresa=emp, escenario=esc, periodo=per, cuenta_local=loc(emp, cta),
                descripcion=desc or NOMBRE_CTA[cta], moneda=EMP[emp]["moneda"], monto=round(monto, 2),
                socio_ic=socio, doc_ic_id=doc, moneda_tx=mtx, monto_tx=montotx,
                contraparte_id_fiscal=cpf, volumen=vol, precio=precio)

def construir(esc, neg, flujos):
    pyg = {e: [] for e in EMP}
    for per in PERIODOS:
        ebt = {e: 0.0 for e in EMP}
        for e, n in neg.items():
            if n["vol"]:
                v = n["vol"] * n["precio"]
                pyg[e].append(linea(e, esc, per, "4100", v, cpf="VARIOS", vol=n["vol"], precio=n["precio"]))
                pyg[e].append(linea(e, esc, per, "5100", v * n["costo"]))
                ebt[e] += v - v * n["costo"]
            pyg[e].append(linea(e, esc, per, "6100", n["gasto"])); ebt[e] -= n["gasto"]
            if n["gf"]:
                pyg[e].append(linea(e, esc, per, "7100", n["gf"])); ebt[e] -= n["gf"]
        for fid, tipo, em, rc, mtx, mt, ce, cr in flujos:
            doc = f"IC-{fid}-{per}"
            le, lr = a_local(em, mtx, mt), a_local(rc, mtx, mt)
            pyg[em].append(linea(em, esc, per, ce, le, socio=rc, doc=doc, mtx=mtx, montotx=mt))
            pyg[rc].append(linea(rc, esc, per, cr, lr, socio=em, doc=doc, mtx=mtx, montotx=mt))
            ebt[em] += le; ebt[rc] -= lr
        for e in EMP:
            if ebt[e] > 0:
                pyg[e].append(linea(e, esc, per, "8100", ebt[e] * EMP[e]["isr"]))
    return pyg

def construir_balance(esc, neg, flujos, pyg):
    bal = {}
    per = PERIODOS[-1]
    for e, n in neg.items():
        L = []
        def add(cta, monto, **kw):
            L.append(linea(e, esc, per, cta, monto, **kw))
        v = n["vol"] * n["precio"]
        add("1100", n["ef"]); add("1200", v); add("1300", n["inv"]); add("1500", n["af"])
        add("2100", v * n["costo"] * 0.5)
        if n["deuda"]:
            add("2200", n["deuda"])
        # saldos IC al cierre = documentos de diciembre pendientes
        for fid, tipo, em, rc, mtx, mt, ce, cr in flujos:
            doc = f"IC-{fid}-{per}"
            if em == e:
                add("1250", a_local(e, mtx, mt), socio=rc, doc=doc, mtx=mtx, montotx=mt)
            if rc == e:
                add("2150", a_local(e, mtx, mt), socio=em, doc=doc, mtx=mtx, montotx=mt)
        for pid, pr, de, mtx, mt in PRESTAMOS:
            if pr == e:
                add("1600", a_local(e, mtx, mt), socio=de, doc=f"IC-{pid}", mtx=mtx, montotx=mt)
            if de == e:
                add("2250", a_local(e, mtx, mt), socio=pr, doc=f"IC-{pid}", mtx=mtx, montotx=mt)
        add("3100", n["capital"])
        act = sum(x["monto"] for x in L if x["cuenta_local"] in [loc(e, c) for c in ("1100", "1200", "1250", "1300", "1500", "1600")])
        pas = sum(x["monto"] for x in L if x["cuenta_local"] in [loc(e, c) for c in ("2100", "2150", "2200", "2250", "3100")])
        add("3200", act - pas)  # utilidades retenidas cuadra el balance
        bal[e] = L
    return bal

# ---------------------------------------------------------------- errores sembrados
def sembrar(pyg, bal, tasas_rows):
    errs = []
    def reg(cod, regla, emp, archivo, desc, efecto):
        errs.append(dict(codigo=cod, regla_esperada=regla, empresa=emp, archivo=archivo, descripcion=desc, efecto_si_no_se_detecta=efecto))

    # E01 tasa invertida MXN mayo
    for r in tasas_rows:
        if r["moneda"] == "MXN" and r["periodo"] == "2027-05" and r["tipo_tasa"] == "PRESUPUESTO":
            r["tasa_a_usd"] = 18.0
    reg("E01", "V08", "MXN", "tasas_grupo_V1.csv", "Tasa MXN PRESUPUESTO de 2027-05 cargada invertida: 18.0 en vez de 0.0556",
        "El P&L de mayo de MX1 y MX2 se multiplica x324 en USD")
    # E02 escala US1 julio gasto op x1000
    for x in pyg["US1"]:
        if x["periodo"] == "2027-07" and x["cuenta_local"] == "6000":
            x["monto"] = round(x["monto"] * 1000, 2)
    reg("E02", "V09", "US1", "presupuesto_US1_V1.csv", "Gastos operativos de 2027-07 en x1000 (60,000,000 en vez de 60,000)",
        "EBIT del grupo cae ~USD 60M; ROIC/EVA absurdos")
    # E03 moneda incorrecta MX1
    n = 0
    for x in pyg["MX1"]:
        if x["periodo"] == "2027-02" and x["cuenta_local"] in ("GAS-OPE", "GF-BAN"):
            x["moneda"] = "USD"; n += 1
    reg("E03", "V02", "MX1", "presupuesto_MX1_V1.csv", f"{n} líneas de 2027-02 declaran moneda USD; MX1 presupuesta en MXN",
        "Si se convierte como USD, gastos de febrero de MX1 se inflan x18")
    # E04 falta espejo: MX1 no registró la compra IC-F1 de noviembre
    pyg["MX1"] = [x for x in pyg["MX1"] if x["doc_ic_id"] != "IC-F1-2027-11"]
    reg("E04", "V12", "MX1", "presupuesto_MX1_V1.csv", "MX1 no registró la compra IC-F1-2027-11 a GT1 (GTQ 65,000): venta IC sin contraparte",
        "No se puede eliminar limpio; costo de MX1 subestimado")
    # E05 venta IC registrada como venta a tercero
    for x in pyg["MX1"]:
        if x["doc_ic_id"] == "IC-F3-2027-06" and x["cuenta_local"] == "VTA-IC":
            x.update(cuenta_local="VTA-NAC", descripcion="Ventas a terceros", socio_ic="", doc_ic_id="",
                     moneda_tx="", monto_tx="", contraparte_id_fiscal=EMP["MX2"]["id_fiscal"])
    reg("E05", "V13", "MX1", "presupuesto_MX1_V1.csv", "Venta de junio a MX2 (MXN 900,000) registrada como venta a tercero (contraparte RFC de MX2)",
        "Doble conteo: USD 50,000 de ventas que no se eliminan")
    # E06 cuenta sin mapear MX2
    for x in pyg["MX2"]:
        if x["periodo"] == "2027-09" and x["cuenta_local"] == "GAS-OPE":
            x["cuenta_local"] = "GAS-OTR"; x["descripcion"] = "Otros gastos"
    reg("E06", "V03", "MX2", "presupuesto_MX2_V1.csv", "Gasto operativo de 2027-09 en cuenta local GAS-OTR sin mapeo a cuenta de grupo",
        "MXN 600,000 desaparecen del consolidado (EBIT sobrestimado)")
    # E07 duplicado US1
    dup = [x for x in pyg["US1"] if x["periodo"] == "2027-04" and x["cuenta_local"] == "4000"][0]
    pyg["US1"].append(dict(dup))
    reg("E07", "V04", "US1", "presupuesto_US1_V1.csv", "Ventas a terceros de 2027-04 duplicadas",
        "Ventas del grupo infladas USD 300,000")
    # E08 mes faltante GT2
    pyg["GT2"] = [x for x in pyg["GT2"] if x["periodo"] != "2027-03"]
    reg("E08", "V05", "GT2", "presupuesto_GT2_V1.csv", "GT2 no cargó el periodo 2027-03 (deja huérfanas IC-F2-2027-03, IC-F4-2027-03, IC-F5b-2027-03)",
        "Falta un mes de GT2 y tres documentos IC quedan sin contraparte")
    # E09 signo invertido GT1
    for x in pyg["GT1"]:
        if x["periodo"] == "2027-08" and x["cuenta_local"] == "4.1.01":
            x["monto"] = -x["monto"]
    reg("E09", "V07", "GT1", "presupuesto_GT1_V1.csv", "Ventas a terceros de 2027-08 con signo negativo",
        "Ventas del grupo caen 2 x USD 250,000")
    # E10 balance descuadrado GT1
    for x in bal["GT1"]:
        if x["cuenta_local"] == "1.3.01":
            x["monto"] += 50_000
    reg("E10", "V06", "GT1", "balance_GT1_V1.csv", "Inventario de cierre con GTQ 50,000 de más: Activo ≠ Pasivo + Patrimonio",
        "Balance consolidado no cuadra; capital invertido mal")
    # E11 autofacturación US2
    pyg["US2"].append(linea("US2", "PPTO_V1", "2027-01", "4300", 5_000, socio="US2", doc="IC-F5x-2027-01", mtx="USD", montotx=5_000))
    reg("E11", "V11", "US2", "presupuesto_US2_V1.csv", "US2 se factura a sí misma un servicio de gestión USD 5,000 (socio_ic = US2)",
        "Ingreso ficticio USD 5,000")
    # E12 IC sin socio GT2
    for x in pyg["GT2"]:
        if x["doc_ic_id"] == "IC-F2-2027-05" and x["cuenta_local"] == "4.1.02":
            x["socio_ic"] = ""
    reg("E12", "V10", "GT2", "presupuesto_GT2_V1.csv", "Venta IC de 2027-05 (doc IC-F2-2027-05) sin socio_ic",
        "No se sabe contra quién eliminar")
    # E13 precio de transferencia fuera de política (ambas patas)
    for emp in ("US2", "MX2"):
        for x in pyg[emp]:
            if str(x["doc_ic_id"]).startswith("IC-F5d-"):
                x["monto_tx"] = 12_000
                x["monto"] = round(a_local(emp, "USD", 12_000), 2)
    reg("E13", "V14", "US2/MX2", "presupuesto_US2_V1.csv + presupuesto_MX2_V1.csv",
        "Fee de gestión US2→MX2 de USD 12,000/mes = 8 % de ventas de MX2; la política TP-MGMT permite 2 %–5 %",
        "Riesgo fiscal de precios de transferencia (consolidado no cambia porque se elimina)")
    # E14 corte: GT2 registra en noviembre la compra que US1 factura en diciembre
    for x in pyg["GT2"]:
        if x["doc_ic_id"] == "IC-F4-2027-12":
            x["periodo"] = "2027-11"
    reg("E14", "V18", "GT2", "presupuesto_GT2_V1.csv", "GT2 registra IC-F4-2027-12 (USD 20,000 de US1) en 2027-11: diferencia de corte",
        "Noviembre y diciembre no concilian entre US1 y GT2")
    return errs

# ---------------------------------------------------------------- escritura
def w(path, rows, cols):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=cols); wr.writeheader(); wr.writerows(rows)

def tasas_rows(tasas, esc):
    out = []
    for mon, d in tasas.items():
        for per in PERIODOS:
            for tipo, t in d.items():
                if tipo == "HISTORICA" and per != PERIODOS[-1]:
                    continue
                out.append(dict(escenario=esc, periodo=per, moneda=mon, tipo_tasa=tipo, tasa_a_usd=round(t, 8)))
    return out

def escribir_cargas(carpeta, pyg, bal, sufijo):
    for e in EMP:
        w(f"{carpeta}/presupuesto_{e}_{sufijo}.csv", pyg[e], COLS_P)
        w(f"{carpeta}/balance_{e}_{sufijo}.csv", bal[e], COLS_P)

def main():
    D = f"{BASE}/datos"; R = f"{BASE}/_respuestas"
    w(f"{D}/maestros/empresas.csv",
      [dict(empresa_id=k, nombre=v["nombre"], pais=v["pais"], moneda_funcional=v["moneda"], id_fiscal=v["id_fiscal"], tasa_isr=v["isr"]) for k, v in EMP.items()],
      ["empresa_id", "nombre", "pais", "moneda_funcional", "id_fiscal", "tasa_isr"])
    w(f"{D}/maestros/monedas.csv", [dict(moneda_id=a, nombre=b, decimales=c) for a, b, c in MONEDAS], ["moneda_id", "nombre", "decimales"])
    w(f"{D}/maestros/cuentas_grupo.csv",
      [dict(cuenta_grupo_id=a, nombre=b, tipo=c, rubro=d, es_ic=e, cuenta_contraparte_ic=f, corriente=g) for a, b, c, d, e, f, g in CUENTAS],
      ["cuenta_grupo_id", "nombre", "tipo", "rubro", "es_ic", "cuenta_contraparte_ic", "corriente"])
    w(f"{D}/maestros/mapeo_cuentas.csv",
      [dict(pais=p, cuenta_local=l, cuenta_grupo_id=g) for p, m in LOCAL.items() for g, l in m.items()],
      ["pais", "cuenta_local", "cuenta_grupo_id"])
    w(f"{D}/maestros/parametros_V1.csv", [dict(escenario="PPTO_V1", parametro=a, valor=b, descripcion=c) for a, b, c in PARAMETROS_V1], ["escenario", "parametro", "valor", "descripcion"])
    w(f"{D}/maestros/parametros_V2.csv", [dict(escenario="PPTO_V2", parametro=a, valor=b, descripcion=c) for a, b, c in PARAMETROS_V2], ["escenario", "parametro", "valor", "descripcion"])
    w(f"{D}/maestros/politicas_tp.csv",
      [dict(politica_id=a, tipo_ic=b, descripcion=c, pct_min=d, pct_max=e) for a, b, c, d, e in POLITICAS_TP],
      ["politica_id", "tipo_ic", "descripcion", "pct_min", "pct_max"])

    pyg1 = construir("PPTO_V1", NEG_V1, FLUJOS_V1); bal1 = construir_balance("PPTO_V1", NEG_V1, FLUJOS_V1, pyg1)
    t1 = tasas_rows(TASAS_V1, "PPTO_V1")
    escribir_cargas(f"{R}/cargas_v1_corregidas", pyg1, bal1, "V1")
    w(f"{R}/tasas_grupo_V1_corregida.csv", t1, ["escenario", "periodo", "moneda", "tipo_tasa", "tasa_a_usd"])

    pyg1e, bal1e, t1e = copy.deepcopy(pyg1), copy.deepcopy(bal1), copy.deepcopy(t1)
    errs = sembrar(pyg1e, bal1e, t1e)
    escribir_cargas(f"{D}/cargas_v1", pyg1e, bal1e, "V1")
    w(f"{D}/tasas/tasas_grupo_V1.csv", t1e, ["escenario", "periodo", "moneda", "tipo_tasa", "tasa_a_usd"])
    w(f"{R}/errores_sembrados.csv", errs, ["codigo", "regla_esperada", "empresa", "archivo", "descripcion", "efecto_si_no_se_detecta"])

    TASA_LOCAL.clear(); TASA_LOCAL.update(TASA_LOCAL_V2)
    pyg2 = construir("PPTO_V2", NEG_V2, FLUJOS_V2); bal2 = construir_balance("PPTO_V2", NEG_V2, FLUJOS_V2, pyg2)
    escribir_cargas(f"{D}/cargas_v2", pyg2, bal2, "V2")
    w(f"{D}/tasas/tasas_grupo_V2.csv", tasas_rows(TASAS_V2, "PPTO_V2"), ["escenario", "periodo", "moneda", "tipo_tasa", "tasa_a_usd"])
    print(f"OK: {len(errs)} errores sembrados")

if __name__ == "__main__":
    main()
