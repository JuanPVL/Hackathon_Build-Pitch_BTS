"""
Motor de referencia (oráculo) para el hackathon.
NO es la solución final: es la implementación mínima y legible contra la que se compara
lo que construyan en Supabase/React. Si su sistema y este motor dan números distintos,
uno de los dos está mal — y el linaje dice dónde.

Corre:
  1. Validador sobre V1 con errores  -> hallazgos + cobertura vs hoja de respuestas
  2. Consolidado "ingenuo" (a la Excel) sobre V1 con errores
  3. Validador + consolidación completa sobre V1 corregida y V2
  4. Conciliación IC, matriz IC, eliminaciones, linaje, KPIs
  5. Bridge V1 corregida -> V2 (explicador de desviaciones)
Salida: ../resultados_referencia/
Uso: python motor_referencia.py
"""
import glob, os, shutil, statistics
import pandas as pd

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = f"{BASE}/resultados_referencia"
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT, exist_ok=True)
pd.options.display.float_format = "{:,.2f}".format

# ============================================================ carga
def maestros():
    m = {}
    m["emp"] = pd.read_csv(f"{BASE}/datos/maestros/empresas.csv").set_index("empresa_id")
    m["ctas"] = pd.read_csv(f"{BASE}/datos/maestros/cuentas_grupo.csv", dtype=str).set_index("cuenta_grupo_id")
    m["mapeo"] = pd.read_csv(f"{BASE}/datos/maestros/mapeo_cuentas.csv", dtype=str)
    m["tp"] = pd.read_csv(f"{BASE}/datos/maestros/politicas_tp.csv")
    return m

def cargar(carpeta):
    frames = []
    for f in sorted(glob.glob(f"{carpeta}/*.csv")):
        df = pd.read_csv(f, dtype={"cuenta_local": str, "socio_ic": str, "doc_ic_id": str,
                                   "moneda_tx": str, "contraparte_id_fiscal": str})
        archivo = os.path.basename(f)
        df["archivo"] = archivo
        df["tipo_archivo"] = "BALANCE" if archivo.startswith("balance") else "PYG"
        df["linea_id"] = [f"{archivo}#fila{i + 2}" for i in range(len(df))]  # fila como en Excel
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    for c in ("socio_ic", "doc_ic_id", "moneda_tx", "contraparte_id_fiscal"):
        df[c] = df[c].fillna("")
    return df

def cargar_tasas(path):
    t = pd.read_csv(path)
    return t

def cargar_params(path):
    p = pd.read_csv(path)
    return dict(zip(p.parametro, p.valor))

# ============================================================ utilidades
def tasa_robusta(tasas, moneda, tipo):
    """mediana del año: se usa SOLO para estimar impactos, nunca para consolidar"""
    s = tasas[(tasas.moneda == moneda) & (tasas.tipo_tasa == tipo)].tasa_a_usd
    return float(s.median()) if len(s) else 1.0

def mapear(df, m):
    pais = df.empresa.map(m["emp"].pais)
    mp = m["mapeo"].set_index(["pais", "cuenta_local"]).cuenta_grupo_id
    df = df.copy()
    df["cuenta_grupo"] = [mp.get((p, c), None) for p, c in zip(pais, df.cuenta_local)]
    return df

# ============================================================ VALIDADOR
def validar(df, tasas, params, m):
    H = []
    def h(regla, sev, emp, reg_id, msg, impacto, esperado="", encontrado=""):
        H.append(dict(regla=regla, severidad=sev, empresa=emp, registro=reg_id, mensaje=msg,
                      encontrado=encontrado, esperado=esperado, impacto_usd=round(abs(impacto), 2)))
    df = mapear(df, m)
    func = df.empresa.map(m["emp"].moneda_funcional)
    rate = {mon: tasa_robusta(tasas, mon, "PRESUPUESTO") for mon in ("GTQ", "MXN", "USD")}
    df["usd_est"] = df.monto * func.map(rate)
    ctas = m["ctas"]

    # V01 estructura
    req = {"empresa", "escenario", "periodo", "cuenta_local", "moneda", "monto"}
    if not req.issubset(df.columns):
        h("V01", "B", "*", "*", f"Faltan columnas: {req - set(df.columns)}", 0)
    malos = df[~df.periodo.astype(str).str.match(r"^\d{4}-\d{2}$")]
    for _, r in malos.iterrows():
        h("V01", "B", r.empresa, r.linea_id, "Periodo con formato inválido", r.usd_est, "AAAA-MM", r.periodo)

    # V02 moneda declarada vs funcional
    for _, r in df[df.moneda != func].iterrows():
        imp = r.monto * (rate.get(r.moneda, 1) - rate[func[_]])
        h("V02", "B", r.empresa, r.linea_id, f"Moneda declarada {r.moneda} ≠ moneda funcional {func[_]}", imp, func[_], r.moneda)

    # V03 cuenta sin mapeo
    for _, r in df[df.cuenta_grupo.isna()].iterrows():
        h("V03", "B", r.empresa, r.linea_id, f"Cuenta local '{r.cuenta_local}' sin mapeo a cuenta de grupo", r.usd_est, "cuenta mapeada", r.cuenta_local)

    # V04 duplicados
    k = ["empresa", "tipo_archivo", "periodo", "cuenta_local", "socio_ic", "doc_ic_id", "contraparte_id_fiscal"]
    dups = df[df.duplicated(k, keep="first")]
    for _, r in dups.iterrows():
        h("V04", "B", r.empresa, r.linea_id, f"Línea duplicada ({r.cuenta_local} {r.periodo})", r.usd_est)

    # V05 periodos faltantes
    pyg = df[df.tipo_archivo == "PYG"]
    todos = sorted(pyg.periodo.unique())
    for e, g in pyg.groupby("empresa"):
        falt = sorted(set(todos) - set(g.periodo))
        for p in falt:
            vt = g[g.cuenta_grupo == "4100"].groupby("periodo").usd_est.sum()
            h("V05", "B", e, f"presupuesto_{e}", f"Periodo {p} sin ninguna línea", vt.median() if len(vt) else 0, "12 periodos", f"falta {p}")

    # V06 balance cuadra
    bal = df[df.tipo_archivo == "BALANCE"].copy()
    bal["tipo"] = bal.cuenta_grupo.map(ctas.tipo)
    for (e, p), g in bal.groupby(["empresa", "periodo"]):
        a = g[g.tipo == "ACT"].monto.sum(); pp = g[g.tipo.isin(["PAS", "PAT"])].monto.sum()
        if abs(a - pp) > 1:
            h("V06", "B", e, f"balance_{e} {p}", f"Activo {a:,.2f} ≠ Pasivo+Patrimonio {pp:,.2f}",
              (a - pp) * rate[m['emp'].moneda_funcional[e]], f"{pp:,.2f}", f"{a:,.2f}")

    # V07 signo (convención: todo positivo, la naturaleza la da la cuenta)
    for _, r in df[df.monto < 0].iterrows():
        h("V07", "B", r.empresa, r.linea_id, f"Monto negativo en {r.cuenta_local} ({r.descripcion})", 2 * r.usd_est, "> 0", f"{r.monto:,.2f}")

    # V08 tasas fuera de banda
    banda = float(params["BANDA_TASA_PCT"])
    for (mon, tipo), g in tasas.groupby(["moneda", "tipo_tasa"]):
        med = g.tasa_a_usd.median()
        for _, r in g.iterrows():
            if abs(r.tasa_a_usd / med - 1) > banda:
                lin = pyg[(pyg.periodo == r.periodo) & (pyg.empresa.map(m["emp"].moneda_funcional) == mon)]
                imp = lin.monto.sum() * (r.tasa_a_usd - med) if tipo == "PRESUPUESTO" else 0
                inv = " (parece invertida: 1/x ≈ mediana)" if abs((1 / r.tasa_a_usd) / med - 1) < banda else ""
                h("V08", "B", mon, f"tasas {r.periodo} {tipo}", f"Tasa {mon} {tipo} {r.periodo} fuera de banda{inv}",
                  imp, f"≈{med:.6f}", f"{r.tasa_a_usd}")

    # V09 escala
    umbral = float(params["UMBRAL_ESCALA"])
    for (e, c), g in pyg.groupby(["empresa", "cuenta_local"]):
        if len(g) < 3:
            continue
        med = statistics.median(g.monto.abs())
        for _, r in g.iterrows():
            if med and abs(r.monto) / med > umbral:
                ratio = abs(r.monto) / med
                h("V09", "B" if ratio > 100 else "A", e, r.linea_id,
                  f"{c} {r.periodo} es {ratio:,.0f}x la mediana de la cuenta (¿miles vs unidades?)",
                  (abs(r.monto) - med) * rate[m['emp'].moneda_funcional[e]], f"≈{med:,.2f}", f"{r.monto:,.2f}")

    # V10 línea en cuenta IC sin socio / V11 autofacturación
    es_ic = df.cuenta_grupo.map(ctas.es_ic) == "1"
    for _, r in df[es_ic & (df.socio_ic == "")].iterrows():
        h("V10", "B", r.empresa, r.linea_id, f"Cuenta IC {r.cuenta_local} sin socio_ic (doc {r.doc_ic_id or '—'})", r.usd_est)
    for _, r in df[df.socio_ic == df.empresa].iterrows():
        h("V11", "B", r.empresa, r.linea_id, f"Autofacturación: socio_ic = {r.empresa}", r.usd_est)

    # V12 / V18 pareo de documentos IC (P&L)
    icl = df[es_ic & (df.doc_ic_id != "") & (df.tipo_archivo == "PYG")]
    tol_usd, tol_pct = float(params["TOLERANCIA_FX_USD"]), float(params["TOLERANCIA_FX_PCT"])
    for doc, g in icl.groupby("doc_ic_id"):
        ing = g[g.cuenta_grupo.map(ctas.tipo) == "ING"]; gas = g[g.cuenta_grupo.map(ctas.tipo) == "GAS"]
        if len(ing) == 0 or len(gas) == 0:
            r = g.iloc[0]
            lado = "emisor (venta)" if len(ing) else "receptor (compra)"
            h("V12", "B", f"{r.empresa}/{r.socio_ic or '¿?'}", r.linea_id, f"{doc}: solo existe la pata del {lado}; falta el espejo en {r.socio_ic or '¿?'}", r.usd_est)
            continue
        e, rr = ing.iloc[0], gas.iloc[0]
        if abs(float(e.monto_tx) - float(rr.monto_tx)) > 0.01:
            h("V12", "B", e.empresa, f"{e.linea_id} vs {rr.linea_id}", f"{doc}: monto_tx emisor {e.monto_tx} ≠ receptor {rr.monto_tx}",
              (float(e.monto_tx) - float(rr.monto_tx)) * rate.get(e.moneda_tx, 1))
        dif = e.usd_est - rr.usd_est
        if abs(float(e.monto_tx) - float(rr.monto_tx)) <= 0.01 and abs(dif) > tol_usd and abs(dif) > tol_pct * abs(e.usd_est):
            h("V20", "A", f"{e.empresa}→{rr.empresa}", f"{e.linea_id} vs {rr.linea_id}",
              f"{doc}: diferencia cambiaria {dif:,.2f} USD ({dif / e.usd_est:.1%}) fuera de tolerancia; revisar tasa local del receptor", dif)
        if e.periodo != rr.periodo:
            h("V18", "A", rr.empresa, rr.linea_id, f"{doc}: emisor {e.empresa} lo registra en {e.periodo}, receptor {rr.empresa} en {rr.periodo} (corte)",
              e.usd_est, e.periodo, rr.periodo)

    # V13 venta a "tercero" que es empresa del grupo
    fiscal = {v: k for k, v in m["emp"].id_fiscal.items()}
    no_ic = df.cuenta_grupo.map(ctas.es_ic) == "0"
    for _, r in df[no_ic & df.contraparte_id_fiscal.isin(fiscal)].iterrows():
        h("V13", "B", r.empresa, r.linea_id,
          f"Registrado en cuenta de terceros ({r.cuenta_local}) pero la contraparte {r.contraparte_id_fiscal} es {fiscal[r.contraparte_id_fiscal]} (grupo)",
          r.usd_est, "cuenta IC + socio_ic", "cuenta terceros")

    # V14 precios de transferencia (servicios de gestión)
    pol = m["tp"].iloc[0]
    fees = icl[(icl.cuenta_grupo == "4300")]
    for rc, g in fees.groupby("socio_ic"):
        if rc not in m["emp"].index:
            continue
        fee_usd = sum(float(x) * rate.get(mt, 1) for x, mt in zip(g.monto_tx, g.moneda_tx))
        vt = pyg[(pyg.empresa == rc) & (pyg.cuenta_grupo == "4100")].usd_est.sum()
        if vt > 0:
            pct = fee_usd / vt
            if not (pol.pct_min - 1e-6 <= pct <= pol.pct_max + 1e-6):
                exceso = fee_usd - pol.pct_max * vt if pct > pol.pct_max else pol.pct_min * vt - fee_usd
                h("V14", "A", f"{g.empresa.iloc[0]}→{rc}", pol.politica_id,
                  f"Fee de gestión {g.empresa.iloc[0]}→{rc} = {pct:.1%} de ventas de {rc}; política {pol.pct_min:.0%}–{pol.pct_max:.0%}",
                  exceso, f"{pol.pct_min:.0%}–{pol.pct_max:.0%}", f"{pct:.1%}")

    out = pd.DataFrame(H, columns=["regla", "severidad", "empresa", "registro", "mensaje", "encontrado", "esperado", "impacto_usd"])
    if len(out):
        out = out.sort_values(["severidad", "impacto_usd"], ascending=[True, False]).reset_index(drop=True)
    return out

# ============================================================ CONVERSIÓN + CONSOLIDACIÓN
def tasa_lookup(tasas):
    return {(r.periodo, r.moneda, r.tipo_tasa): r.tasa_a_usd for r in tasas.itertuples()}

def convertir(df, tasas, m, usar_moneda_declarada=False):
    df = mapear(df, m)
    T = tasa_lookup(tasas)
    ctas = m["ctas"]
    mon = df.moneda if usar_moneda_declarada else df.empresa.map(m["emp"].moneda_funcional)
    tipos = []
    for c, ta in zip(df.cuenta_grupo, df.tipo_archivo):
        if ta == "PYG":
            tipos.append("PRESUPUESTO")
        else:
            tipos.append("HISTORICA" if c == "3100" else "CIERRE")
    df["tipo_tasa"] = tipos
    df["moneda_conv"] = mon.values
    df["tasa"] = [T.get((p, mo, t), float("nan")) for p, mo, t in zip(df.periodo, df.moneda_conv, df.tipo_tasa)]
    df["usd"] = df.monto * df.tasa
    df["tipo_cta"] = df.cuenta_grupo.map(ctas.tipo)
    df["es_ic"] = df.cuenta_grupo.map(ctas.es_ic) == "1"
    return df

def conciliar_y_eliminar(dfc, params, m):
    """Devuelve (conciliacion, eliminaciones). Elimina SOLO lo conciliado; el resto queda visible."""
    tol_usd, tol_pct = float(params["TOLERANCIA_FX_USD"]), float(params["TOLERANCIA_FX_PCT"])
    conc, elim = [], []
    ic = dfc[dfc.es_ic & (dfc.doc_ic_id != "")]
    n = 0
    for (doc, ta), g in ic.groupby(["doc_ic_id", "tipo_archivo"]):
        if ta == "PYG":
            a = g[g.tipo_cta == "ING"]; b = g[g.tipo_cta == "GAS"]
        else:
            a = g[g.tipo_cta == "ACT"]; b = g[g.tipo_cta == "PAS"]
        base = dict(doc_ic_id=doc, estado_financiero=ta)
        if len(a) != 1 or len(b) != 1:
            r = g.iloc[0]
            conc.append(dict(base, emisor=r.empresa if len(a) else r.socio_ic, receptor=r.socio_ic if len(a) else r.empresa,
                             estado="SIN_CONTRAPARTE", usd_emisor=a.usd.sum(), usd_receptor=b.usd.sum(), diferencia_usd=a.usd.sum() - b.usd.sum(),
                             lineas=";".join(g.linea_id)))
            continue
        x, y = a.iloc[0], b.iloc[0]
        dif = x.usd - y.usd
        if abs(float(x.monto_tx) - float(y.monto_tx)) > 0.01:
            estado = "DIFERENCIA_MONTO"
        elif x.periodo != y.periodo:
            estado = "DIFERENCIA_CORTE"
        elif abs(dif) <= tol_usd or abs(dif) <= tol_pct * abs(x.usd):
            estado = "CONCILIADO" if abs(dif) < 0.005 else "CONCILIADO_FX"
        else:
            estado = "FX_FUERA_TOLERANCIA"
        conc.append(dict(base, emisor=x.empresa, receptor=y.empresa, estado=estado, usd_emisor=x.usd, usd_receptor=y.usd,
                         diferencia_usd=dif, lineas=f"{x.linea_id};{y.linea_id}"))
        if estado in ("CONCILIADO", "CONCILIADO_FX"):
            n += 1; eid = f"EL-{n:04d}"
            regla = {"4200": "E1", "4300": "E1", "7300": "E4", "1250": "E2", "1600": "E3"}[x.cuenta_grupo]
            cta_dif = "7900" if ta == "PYG" else "3900"
            # asiento balanceado: anula ambas patas, la diferencia va a 7900 (P&L) o 3900 CTA (balance)
            # convención de signo en "efecto": positivo = aumenta el saldo natural de la cuenta
            elim += [dict(elim_id=eid, regla=regla, doc_ic_id=doc, empresa=x.empresa, cuenta_grupo=x.cuenta_grupo, efecto_usd=-x.usd, origen=x.linea_id),
                     dict(elim_id=eid, regla=regla, doc_ic_id=doc, empresa=y.empresa, cuenta_grupo=y.cuenta_grupo, efecto_usd=-y.usd, origen=y.linea_id)]
            if abs(dif) >= 0.005:
                # P&L: 7900 es gasto -> efecto = y - x deja la utilidad intacta
                # Balance: 3900 es patrimonio -> efecto = x - y (activo eliminado > pasivo eliminado reduce patrimonio... se ajusta en CTA)
                ef = (y.usd - x.usd) if ta == "PYG" else -(x.usd - y.usd)
                elim.append(dict(elim_id=eid, regla="E7", doc_ic_id=doc, empresa="GRUPO", cuenta_grupo=cta_dif, efecto_usd=ef, origen=f"{x.linea_id};{y.linea_id}"))
    return pd.DataFrame(conc), pd.DataFrame(elim)

def consolidar(dfc, elim, m):
    ctas = m["ctas"]
    ag = dfc.groupby("cuenta_grupo").usd.sum().rename("agregado")
    el = elim.groupby("cuenta_grupo").efecto_usd.sum().rename("eliminaciones") if len(elim) else pd.Series(dtype=float, name="eliminaciones")
    c = pd.concat([ag, el], axis=1).fillna(0)
    c["consolidado"] = c.agregado + c.eliminaciones
    # CTA: plug para que el balance consolidado cuadre
    tipo = ctas.tipo.reindex(c.index)
    act = c.consolidado[tipo == "ACT"].sum(); pas = c.consolidado[tipo.isin(["PAS", "PAT"])].sum()
    if "3900" not in c.index:
        c.loc["3900"] = 0
    c.loc["3900", "cta_conversion"] = act - pas
    c["cta_conversion"] = c.get("cta_conversion", 0).fillna(0)
    c["consolidado"] = c.agregado + c.eliminaciones + c.cta_conversion
    c.insert(0, "nombre", ctas.nombre.reindex(c.index))
    c.insert(1, "tipo", ctas.tipo.reindex(c.index))
    c.insert(2, "rubro", ctas.rubro.reindex(c.index))
    return c.sort_index()

def linaje(dfc, elim, cons):
    L = [dict(cuenta_grupo=r.cuenta_grupo, origen_tipo="LINEA_CARGA", origen_id=r.linea_id, empresa=r.empresa,
              monto_local=r.monto, moneda=r.moneda_conv, tasa=r.tasa, aporte_usd=r.usd) for r in dfc.itertuples()]
    L += [dict(cuenta_grupo=r.cuenta_grupo, origen_tipo=f"ELIMINACION_{r.regla}", origen_id=f"{r.elim_id} ({r.doc_ic_id})", empresa=r.empresa,
               monto_local="", moneda="USD", tasa=1, aporte_usd=r.efecto_usd) for r in elim.itertuples()]
    cta = cons.loc["3900", "cta_conversion"] if "3900" in cons.index else 0
    L.append(dict(cuenta_grupo="3900", origen_tipo="CTA_CONVERSION", origen_id="plug balance consolidado", empresa="GRUPO",
                  monto_local="", moneda="USD", tasa=1, aporte_usd=cta))
    lin = pd.DataFrame(L)
    chk = lin.groupby("cuenta_grupo").aporte_usd.sum().reindex(cons.index).fillna(0)
    ok = bool(((chk - cons.consolidado).abs() < 0.01).all())
    return lin, ok

# ============================================================ KPIs
def kpis(cons, params, isr_ef):
    g = lambda rub: cons[cons.rubro == rub]
    def neto(rub):
        x = g(rub); return (x.consolidado * x.tipo.map({"ING": 1, "GAS": -1, "ACT": 1, "PAS": -1, "PAT": -1})).sum()
    ventas = cons.loc[[c for c in ("4100", "4200") if c in cons.index], "consolidado"].sum()
    ebit = neto("VENTAS") + neto("OTROS_ING_OP") + neto("COSTO") + neto("GASTO_OP")
    cto = neto("CTO"); af = neto("AF")
    ci = cto + af
    activo = cons[cons.tipo == "ACT"].consolidado.sum()
    pas_corr = cons.loc[[c for c in ("2100", "2150") if c in cons.index], "consolidado"].sum()
    ce = activo - pas_corr
    nopat = ebit * (1 - isr_ef)
    wacc = float(params["WACC"])
    return dict(ventas_usd=ventas, ebit_usd=ebit, tasa_isr_efectiva=isr_ef, nopat_usd=nopat, cto_neto_usd=cto,
                activo_fijo_usd=af, capital_invertido_usd=ci, activo_total_usd=activo, pasivo_corriente_usd=pas_corr,
                capital_empleado_usd=ce, roic=nopat / ci if ci else float("nan"), roce=ebit / ce if ce else float("nan"),
                wacc=wacc, eva_usd=nopat - wacc * ci)

def isr_efectiva(dfc, m):
    op = dfc[dfc.cuenta_grupo.map(m["ctas"].rubro).isin(["VENTAS", "OTROS_ING_OP", "COSTO", "GASTO_OP"])]
    s = (op.usd * op.tipo_cta.map({"ING": 1, "GAS": -1})).groupby(op.empresa).sum()
    s = s[s > 0]
    return float((s * m["emp"].tasa_isr.reindex(s.index)).sum() / s.sum())

def kpis_por_empresa(dfc, params, m):
    rows = []
    for e, g in dfc.groupby("empresa"):
        c = g.groupby("cuenta_grupo").usd.sum().to_frame("consolidado")
        c["tipo"] = m["ctas"].tipo.reindex(c.index); c["rubro"] = m["ctas"].rubro.reindex(c.index)
        k = kpis(c, params, float(m["emp"].tasa_isr[e])); k["empresa"] = e; rows.append(k)
    return pd.DataFrame(rows).set_index("empresa")

# ============================================================ BRIDGE (explicador)
def bridge(d1, d2, k1, k2, m):
    """Descompone ΔVentas, ΔEBIT y ΔEVA consolidados V1->V2 en efectos que suman exacto."""
    filas = []
    p1 = d1[d1.tipo_archivo == "PYG"].copy(); p2 = d2[d2.tipo_archivo == "PYG"].copy()
    key = ["empresa", "periodo", "cuenta_grupo", "doc_ic_id"]
    for p in (p1, p2):
        p["doc_ic_id"] = p.doc_ic_id.str.replace("PPTO_V2", "").fillna("")
    j = p1.merge(p2, on=key, how="outer", suffixes=("_1", "_2"))
    for c in ("monto", "usd", "tasa", "volumen", "precio"):
        for s in ("_1", "_2"):
            j[c + s] = pd.to_numeric(j[c + s], errors="coerce").fillna(0)
    j["tipo"] = j.cuenta_grupo.map(m["ctas"].tipo); j["rubro"] = j.cuenta_grupo.map(m["ctas"].rubro)
    j["es_ic"] = j.cuenta_grupo.map(m["ctas"].es_ic) == "1"
    j["signo"] = j.tipo.map({"ING": 1, "GAS": -1})
    op = j[j.rubro.isin(["VENTAS", "OTROS_ING_OP", "COSTO", "GASTO_OP"])]
    for r in op.itertuples():
        if r.es_ic:
            # cambia el agregado, pero la eliminación lo anula: efecto consolidado 0 (se reporta igual)
            filas.append(dict(efecto="IC (neutral en consolidado)", empresa=r.empresa, cuenta=r.cuenta_grupo, periodo=r.periodo,
                              ventas=0, ebit=0, detalle_ic_usd=r.signo * (r.usd_2 - r.usd_1)))
            continue
        fx = r.monto_2 * (r.tasa_2 - r.tasa_1)
        if r.cuenta_grupo == "4100" and r.volumen_1 and r.volumen_2:
            vol = (r.volumen_2 - r.volumen_1) * r.precio_1 * r.tasa_1
            pre = (r.precio_2 - r.precio_1) * r.volumen_2 * r.tasa_1
            for ef, v in (("Tipo de cambio", fx), ("Volumen", vol), ("Precio", pre)):
                filas.append(dict(efecto=ef, empresa=r.empresa, cuenta=r.cuenta_grupo, periodo=r.periodo, ventas=v, ebit=v))
        else:
            opv = (r.monto_2 - r.monto_1) * r.tasa_1
            ef = "Costo de ventas (operativo)" if r.rubro == "COSTO" else "Gasto operativo"
            filas.append(dict(efecto="Tipo de cambio", empresa=r.empresa, cuenta=r.cuenta_grupo, periodo=r.periodo, ventas=0, ebit=r.signo * fx))
            filas.append(dict(efecto=ef, empresa=r.empresa, cuenta=r.cuenta_grupo, periodo=r.periodo, ventas=0, ebit=r.signo * opv))
    det = pd.DataFrame(filas).fillna(0)
    # EVA: ΔEVA = ΔNOPAT − (WACC2·CI2 − WACC1·CI1)
    d_nopat_ebit = (k2["ebit_usd"] - k1["ebit_usd"]) * (1 - k1["tasa_isr_efectiva"])
    d_nopat_tax = -k2["ebit_usd"] * (k2["tasa_isr_efectiva"] - k1["tasa_isr_efectiva"])
    d_wacc = -(k2["wacc"] - k1["wacc"]) * k2["capital_invertido_usd"]
    d_ci = -k1["wacc"] * (k2["capital_invertido_usd"] - k1["capital_invertido_usd"])
    eva = pd.DataFrame([dict(efecto="EBIT operativo (después de impuestos)", eva=d_nopat_ebit),
                        dict(efecto="Tasa de impuesto efectiva (mezcla de países)", eva=d_nopat_tax),
                        dict(efecto="Parámetro WACC", eva=d_wacc),
                        dict(efecto="Capital invertido", eva=d_ci)])
    return det, eva

# ============================================================ corridas
def correr(nombre, carpeta, tasas_path, params_path, m, solo_validar=False):
    df = cargar(carpeta); tasas = cargar_tasas(tasas_path); params = cargar_params(params_path)
    hall = validar(df, tasas, params, m)
    if solo_validar:  # con errores bloqueantes NO se consolida: eso es justamente lo que el validador frena
        hall.to_csv(f"{OUT}/{nombre}_validacion_hallazgos.csv", index=False)
        return dict(hall=hall)
    dfc = convertir(df, tasas, m)
    conc, elim = conciliar_y_eliminar(dfc, params, m)
    cons = consolidar(dfc, elim, m)
    lin, ok = linaje(dfc, elim, cons)
    t = isr_efectiva(dfc, m)
    k = kpis(cons, params, t)
    # KPIs "sin eliminar" para mostrar el efecto de las eliminaciones
    sin = cons.copy(); sin["consolidado"] = sin.agregado
    sin.loc["3900", "consolidado"] = sin.consolidado[sin.tipo == "ACT"].sum() - sin.consolidado[sin.tipo.isin(["PAS", "PAT"]) & (sin.index != "3900")].sum()
    k_sin = kpis(sin, params, t)
    kemp = kpis_por_empresa(dfc, params, m)
    # matrices IC
    fact = dfc[dfc.es_ic & (dfc.tipo_archivo == "PYG") & (dfc.tipo_cta == "ING")].pivot_table(index="empresa", columns="socio_ic", values="usd", aggfunc="sum").fillna(0)
    bal = dfc[dfc.es_ic & (dfc.tipo_archivo == "BALANCE")].copy()
    bal["saldo"] = bal.usd * bal.tipo_cta.map({"ACT": 1, "PAS": -1})
    sal = bal.pivot_table(index="empresa", columns="socio_ic", values="saldo", aggfunc="sum").fillna(0)
    pre = f"{OUT}/{nombre}"
    hall.to_csv(f"{pre}_validacion_hallazgos.csv", index=False)
    conc.to_csv(f"{pre}_conciliacion_ic.csv", index=False)
    elim.to_csv(f"{pre}_eliminaciones.csv", index=False)
    cons.to_csv(f"{pre}_consolidado.csv")
    lin.to_csv(f"{pre}_linaje.csv", index=False)
    fact.to_csv(f"{pre}_matriz_ic_facturado_usd.csv"); sal.to_csv(f"{pre}_matriz_ic_saldos_usd.csv")
    pd.DataFrame([dict(vista="consolidado (con eliminaciones)", **k), dict(vista="agregado (sin eliminar)", **k_sin)]).to_csv(f"{pre}_kpis_grupo.csv", index=False)
    kemp.to_csv(f"{pre}_kpis_por_empresa.csv")
    return dict(df=dfc, hall=hall, conc=conc, elim=elim, cons=cons, lin_ok=ok, k=k, k_sin=k_sin, kemp=kemp, fact=fact, sal=sal, params=params)

def ingenuo(m):
    """Lo que pasa hoy: sumar los Excel tal cual, convertir con la moneda que dice el archivo, sin eliminar."""
    df = cargar(f"{BASE}/datos/cargas_v1"); tasas = cargar_tasas(f"{BASE}/datos/tasas/tasas_grupo_V1.csv")
    params = cargar_params(f"{BASE}/datos/maestros/parametros_V1.csv")
    dfc = convertir(df, tasas, m, usar_moneda_declarada=True)
    dfc = dfc[dfc.cuenta_grupo.notna()]
    cons = dfc.groupby("cuenta_grupo").usd.sum().to_frame("consolidado")
    cons["tipo"] = m["ctas"].tipo.reindex(cons.index); cons["rubro"] = m["ctas"].rubro.reindex(cons.index)
    k = kpis(cons, params, isr_efectiva(dfc, m))
    return k

def cobertura(hall):
    esp = pd.read_csv(f"{BASE}/_respuestas/errores_sembrados.csv")
    rows = []
    for e in esp.itertuples():
        emps = e.empresa.split("/")
        hit = hall[(hall.regla == e.regla_esperada) & (hall.empresa.apply(lambda x: any(p in str(x) for p in emps)))]
        rows.append(dict(codigo=e.codigo, regla=e.regla_esperada, empresa=e.empresa, detectado="SÍ" if len(hit) else "NO",
                         hallazgos=len(hit), impacto_usd=hit.impacto_usd.sum(), descripcion=e.descripcion))
    return pd.DataFrame(rows)

def main():
    m = maestros()
    D = f"{BASE}/datos"; R = f"{BASE}/_respuestas"
    # 1) V1 con errores: solo validación + cobertura
    v1e = correr("v1_con_errores", f"{D}/cargas_v1", f"{D}/tasas/tasas_grupo_V1.csv", f"{D}/maestros/parametros_V1.csv", m, solo_validar=True)
    cob = cobertura(v1e["hall"]); cob.to_csv(f"{OUT}/v1_cobertura_errores_sembrados.csv", index=False)
    k_ing = ingenuo(m)
    # 2) V1 corregida y V2
    v1 = correr("v1_corregida", f"{R}/cargas_v1_corregidas", f"{R}/tasas_grupo_V1_corregida.csv", f"{D}/maestros/parametros_V1.csv", m)
    v2 = correr("v2", f"{D}/cargas_v2", f"{D}/tasas/tasas_grupo_V2.csv", f"{D}/maestros/parametros_V2.csv", m)
    det, eva = bridge(v1["df"], v2["df"], v1["k"], v2["k"], m)
    det.to_csv(f"{OUT}/bridge_v1_v2_detalle.csv", index=False); eva.to_csv(f"{OUT}/bridge_v1_v2_eva.csv", index=False)
    comp = pd.DataFrame([dict(vista="Ingenuo (Excel, V1 con errores)", **k_ing),
                         dict(vista="Motor sin eliminar (V1 corregida)", **v1["k_sin"]),
                         dict(vista="Motor consolidado (V1 corregida)", **v1["k"]),
                         dict(vista="Motor consolidado (V2)", **v2["k"])])
    comp.to_csv(f"{OUT}/comparativo_kpis.csv", index=False)
    reporte(v1e, cob, k_ing, v1, v2, det, eva, comp)

# ============================================================ reporte
def money(x): return f"{x:,.0f}"
def pct(x): return f"{x:.2%}"

def reporte(v1e, cob, k_ing, v1, v2, det, eva, comp):
    L = ["# Reporte del motor de referencia", "",
         "Generado por `referencia/motor_referencia.py`. Todas las cifras en USD. Estos son los **resultados esperados**: lo que construyan debe dar lo mismo.", ""]
    # cobertura
    L += ["## 1. Validador sobre V1 con errores", "",
          f"- Hallazgos totales: **{len(v1e['hall'])}** ({(v1e['hall'].severidad == 'B').sum()} bloqueantes, {(v1e['hall'].severidad == 'A').sum()} advertencias)",
          f"- Errores sembrados detectados: **{(cob.detectado == 'SÍ').sum()} de {len(cob)}**", "",
          "| Error | Regla | Empresa | ¿Detectado? | Impacto USD | Descripción |", "|---|---|---|---|---:|---|"]
    for r in cob.itertuples():
        L.append(f"| {r.codigo} | {r.regla} | {r.empresa} | {r.detectado} | {money(r.impacto_usd)} | {r.descripcion} |")
    L += ["", "Top 10 hallazgos por impacto (así debe ordenarlos su validador):", "",
          "| # | Regla | Sev | Empresa | Registro | Mensaje | Impacto USD |", "|---|---|---|---|---|---|---:|"]
    top = v1e["hall"].sort_values("impacto_usd", ascending=False).head(10)
    for i, r in enumerate(top.itertuples(), 1):
        L.append(f"| {i} | {r.regla} | {r.severidad} | {r.empresa} | `{r.registro}` | {r.mensaje} | {money(r.impacto_usd)} |")
    L += ["", "> Hay hallazgos **derivados** (p. ej. E08 deja 3 documentos IC sin contraparte → V12). Son correctos: un error produce varios síntomas. El listado completo está en `v1_con_errores_validacion_hallazgos.csv`.", ""]
    # V1 corregida y V2 limpias
    L += ["## 2. Cargas limpias pasan el validador", "",
          f"- V1 corregida: {(v1['hall'].severidad == 'B').sum()} bloqueantes, {(v1['hall'].severidad == 'A').sum()} advertencias",
          f"- V2: {(v2['hall'].severidad == 'B').sum()} bloqueantes, {(v2['hall'].severidad == 'A').sum()} advertencias", ""]
    # antes/después
    L += ["## 3. Antes y después (el impacto en una tabla)", "",
          "| Vista | Ventas | EBIT | Capital invertido | Capital empleado | ROIC | ROCE | EVA |", "|---|---:|---:|---:|---:|---:|---:|---:|"]
    for r in comp.itertuples():
        L.append(f"| {r.vista} | {money(r.ventas_usd)} | {money(r.ebit_usd)} | {money(r.capital_invertido_usd)} | {money(r.capital_empleado_usd)} | {pct(r.roic)} | {pct(r.roce)} | {money(r.eva_usd)} |")
    L += ["", "- **Ingenuo**: lo que sale hoy sumando los Excel con errores, sin validar ni eliminar.",
          "- **Sin eliminar**: datos ya correctos, pero sin quitar las operaciones entre empresas → ventas y activos inflados.",
          "- **Consolidado**: la cifra correcta del grupo.", ""]
    # consolidado V1
    c = v1["cons"]
    L += ["## 4. Consolidado V1 corregida", "", "| Cuenta | Nombre | Agregado | Eliminaciones | CTA | Consolidado |", "|---|---|---:|---:|---:|---:|"]
    for idx, r in c.iterrows():
        L.append(f"| {idx} | {r.nombre} | {money(r.agregado)} | {money(r.eliminaciones)} | {money(r.cta_conversion)} | **{money(r.consolidado)}** |")
    est = v1["conc"].estado.value_counts().to_dict()
    L += ["", f"- Documentos IC conciliados: {est}", f"- Prueba de integridad del linaje (Σ aportes = consolidado): **{'OK' if v1['lin_ok'] else 'FALLA'}** (V2: {'OK' if v2['lin_ok'] else 'FALLA'})", ""]
    # matriz
    L += ["## 5. Matriz IC V1 corregida — facturado anual (fila factura a columna), USD", ""]
    f = v1["fact"]
    L += ["| Emisor \\ Receptor | " + " | ".join(f.columns) + " |", "|---|" + "---:|" * len(f.columns)]
    for e, r in f.iterrows():
        L.append(f"| {e} | " + " | ".join(money(x) for x in r) + " |")
    s = v1["sal"]
    L += ["", "Saldos IC al cierre (+ me deben / − les debo), USD. Debe ser antisimétrica salvo diferencia FX:", "",
          "| Empresa \\ Socio | " + " | ".join(s.columns) + " |", "|---|" + "---:|" * len(s.columns)]
    for e, r in s.iterrows():
        L.append(f"| {e} | " + " | ".join(money(x) for x in r) + " |")
    # KPIs por empresa
    L += ["", "## 6. KPIs por empresa (V1 corregida, stand-alone en USD)", "", "| Empresa | EBIT | Capital invertido | ROIC | ROCE | EVA |", "|---|---:|---:|---:|---:|---:|"]
    for e, r in v1["kemp"].iterrows():
        L.append(f"| {e} | {money(r.ebit_usd)} | {money(r.capital_invertido_usd)} | {pct(r.roic)} | {pct(r.roce)} | {money(r.eva_usd)} |")
    # bridge
    k1, k2 = v1["k"], v2["k"]
    L += ["", "## 7. Explicador V1 → V2", "",
          f"Ventas consolidadas: {money(k1['ventas_usd'])} → {money(k2['ventas_usd'])} (Δ {money(k2['ventas_usd'] - k1['ventas_usd'])})", "",
          "| Efecto | Δ Ventas | Δ EBIT |", "|---|---:|---:|"]
    agg = det.groupby("efecto")[["ventas", "ebit"]].sum()
    for ef, r in agg.iterrows():
        if abs(r.ventas) >= 0.5 or abs(r.ebit) >= 0.5:
            L.append(f"| {ef} | {money(r.ventas)} | {money(r.ebit)} |")
    L.append(f"| **Total** | **{money(agg.ventas.sum())}** | **{money(agg.ebit.sum())}** |")
    L += ["", f"Control: Δ Ventas real = {money(k2['ventas_usd'] - k1['ventas_usd'])}; Δ EBIT real = {money(k2['ebit_usd'] - k1['ebit_usd'])}", "",
          "Por empresa (top causas de Δ EBIT):", "", "| Efecto | Empresa | Δ EBIT |", "|---|---|---:|"]
    pe = det.groupby(["efecto", "empresa"]).ebit.sum().reset_index()
    pe = pe.reindex(pe.ebit.abs().sort_values(ascending=False).index).head(6)
    for r in pe.itertuples():
        L.append(f"| {r.efecto} | {r.empresa} | {money(r.ebit)} |")
    ic = det[det.efecto.str.startswith("IC")].detalle_ic_usd.sum() if "detalle_ic_usd" in det else 0
    L += ["", f"El fee de gestión US2→MX1 sube de USD 8,000 a 9,000/mes: el ingreso de US2 y el gasto de MX1 se mueven juntos (neto en el agregado: {money(ic)} por diferencia cambiaria) y la eliminación lo deja en **0 en el consolidado**.", "",
          f"EVA: {money(k1['eva_usd'])} → {money(k2['eva_usd'])} (Δ {money(k2['eva_usd'] - k1['eva_usd'])})", "", "| Efecto | Δ EVA |", "|---|---:|"]
    for r in eva.itertuples():
        L.append(f"| {r.efecto} | {money(r.eva)} |")
    L.append(f"| **Total** | **{money(eva.eva.sum())}** |")
    # narrativa
    top3 = agg.ebit.abs().sort_values(ascending=False).index[:3]
    L += ["", "### Texto que el explicador debería producir (plantilla determinística)", "",
          f"> **El EBIT consolidado {'subió' if k2['ebit_usd'] > k1['ebit_usd'] else 'bajó'} USD {money(abs(k2['ebit_usd'] - k1['ebit_usd']))} de V1 a V2.** "
          + " ".join(f"{i}) {ef}: USD {money(agg.loc[ef, 'ebit'])}." for i, ef in enumerate(top3, 1))
          + f" El aumento del fee de gestión US2→MX1 no afecta al grupo porque se elimina. El EVA cambia USD {money(k2['eva_usd'] - k1['eva_usd'])}, de los cuales USD {money(eva.set_index('efecto').loc['Parámetro WACC', 'eva'])} se deben a subir el WACC de {k1['wacc']:.0%} a {k2['wacc']:.0%}.", ""]
    open(f"{OUT}/reporte_referencia.md", "w", encoding="utf-8").write("\n".join(L))
    print("\n".join(L[:40]))

if __name__ == "__main__":
    main()
