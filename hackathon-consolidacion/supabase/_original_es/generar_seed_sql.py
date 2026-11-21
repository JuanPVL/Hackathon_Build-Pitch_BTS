"""Genera los seeds SQL a partir de los CSV de datos/ (correr después de referencia/generar_datos.py)."""
import csv, glob, os

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
D = f"{BASE}/datos"; OUT = os.path.dirname(os.path.abspath(__file__))

REGLAS = [
    ("V01", "Estructura: columnas, tipos y formato de periodo", "B"),
    ("V02", "Moneda declarada = moneda funcional de la empresa", "B"),
    ("V03", "Toda cuenta local tiene mapeo a cuenta de grupo", "B"),
    ("V04", "Sin líneas duplicadas", "B"),
    ("V05", "Todos los periodos del escenario presentes", "B"),
    ("V06", "Balance cuadra: Activo = Pasivo + Patrimonio", "B"),
    ("V07", "Signo según convención (montos positivos)", "B"),
    ("V08", "Tasa de cambio dentro de banda (detecta tasas invertidas)", "B"),
    ("V09", "Escala: valor > N veces la mediana de la cuenta (miles vs unidades)", "B"),
    ("V10", "Línea en cuenta IC sin socio_ic", "B"),
    ("V11", "Autofacturación (socio_ic = la misma empresa)", "B"),
    ("V12", "Documento IC sin contraparte o con monto distinto", "B"),
    ("V13", "Transacción con tercero que en realidad es empresa del grupo", "B"),
    ("V14", "Precio de transferencia fuera de política", "A"),
    ("V18", "Diferencia de corte entre emisor y receptor", "A"),
    ("V20", "Diferencia cambiaria IC fuera de tolerancia", "A"),
]

NUMERICAS = {"decimales", "tasa_isr", "valor", "tasa_a_usd", "pct_min", "pct_max", "monto", "monto_tx", "volumen", "precio"}

def q(v, col=""):
    if v is None or v == "":
        return "null::numeric" if col in NUMERICAS else "null::text"
    if col in NUMERICAS:
        return f"{float(v)!r}::numeric" if col in ("monto", "monto_tx", "volumen", "precio") else str(v)
    return "'" + str(v).replace("'", "''") + "'"

def ins(tabla, cols, rows):
    out = [f"insert into {tabla} ({', '.join(cols)}) values"]
    out.append(",\n".join("  (" + ", ".join(q(r[c], c) for c in cols) + ")" for r in rows) + ";")
    return "\n".join(out)

def rd(p):
    with open(p, encoding="utf-8") as f:
        return list(csv.DictReader(f))

def maestros():
    S = ["-- Generado por generar_seed_sql.py — maestros, escenarios, parámetros, tasas y reglas", "begin;"]
    S.append(ins("moneda", ["moneda_id", "nombre", "decimales"], rd(f"{D}/maestros/monedas.csv")))
    S.append(ins("empresa", ["empresa_id", "nombre", "pais", "moneda_funcional", "id_fiscal", "tasa_isr"], rd(f"{D}/maestros/empresas.csv")))
    ctas = rd(f"{D}/maestros/cuentas_grupo.csv")
    for c in ctas:
        c["es_ic"] = "true" if c["es_ic"] == "1" else "false"
    S.append(ins("cuenta_grupo", ["cuenta_grupo_id", "nombre", "tipo", "rubro", "es_ic", "cuenta_contraparte_ic", "corriente"], ctas)
             .replace("'true'", "true").replace("'false'", "false"))  # es_ic boolean
    S.append(ins("mapeo_cuenta", ["pais", "cuenta_local", "cuenta_grupo_id"], rd(f"{D}/maestros/mapeo_cuentas.csv")))
    S.append("insert into escenario (escenario_id, descripcion) values ('PPTO_V1', 'Presupuesto 2027 versión 1'), ('PPTO_V2', 'Presupuesto 2027 versión 2');")
    for v in ("V1", "V2"):
        p = rd(f"{D}/maestros/parametros_{v}.csv")
        for r in p:
            r["escenario_id"] = r.pop("escenario")
        S.append(ins("parametro", ["escenario_id", "parametro", "valor", "descripcion"], p))
        t = rd(f"{D}/tasas/tasas_grupo_{v}.csv")
        for r in t:
            r["escenario_id"] = r.pop("escenario"); r["moneda_id"] = r.pop("moneda")
        S.append(f"-- tasas {v}" + (" (CONTIENE el error sembrado E01: el validador debe encontrarlo)" if v == "V1" else ""))
        S.append(ins("tasa_grupo", ["escenario_id", "periodo", "moneda_id", "tipo_tasa", "tasa_a_usd"], t))
    S.append(ins("politica_tp", ["politica_id", "tipo_ic", "descripcion", "pct_min", "pct_max"], rd(f"{D}/maestros/politicas_tp.csv")))
    S.append(ins("regla_validacion", ["codigo", "descripcion", "severidad"], [dict(codigo=a, descripcion=b, severidad=c) for a, b, c in REGLAS]))
    S.append("commit;")
    open(f"{OUT}/02_seed_maestros.sql", "w", encoding="utf-8").write("\n\n".join(S) + "\n")

def cargas(carpeta, archivo_sql, estado):
    S = [f"-- Generado por generar_seed_sql.py — cargas de {os.path.basename(carpeta)} en estado {estado}", "begin;"]
    cols = ["empresa", "escenario", "periodo", "cuenta_local", "descripcion", "moneda", "monto", "socio_ic",
            "doc_ic_id", "moneda_tx", "monto_tx", "contraparte_id_fiscal", "volumen", "precio"]
    for f in sorted(glob.glob(f"{carpeta}/*.csv")):
        nombre = os.path.basename(f); rows = rd(f)
        emp, esc = nombre.split("_")[1], "PPTO_" + nombre.split("_")[2].replace(".csv", "")
        tipo = "BALANCE" if nombre.startswith("balance") else "PYG"
        S.append(f"with c as (insert into carga (empresa_id, escenario_id, tipo_archivo, nombre_archivo, estado) "
                 f"values ('{emp}', '{esc}', '{tipo}', '{nombre}', '{estado}') returning carga_id)\n"
                 f"insert into linea_carga (linea_id, carga_id, fila, {', '.join(cols)}) select v.* from c, lateral (values\n"
                 + ",\n".join(f"  ('{nombre}#fila{i + 2}', c.carga_id, {i + 2}, " + ", ".join(q(r[k], k) for k in cols) + ")"
                     for i, r in enumerate(rows))
                 + f") as v(linea_id, carga_id, fila, {', '.join(cols)});")
    S.append("commit;")
    open(f"{OUT}/{archivo_sql}", "w", encoding="utf-8").write("\n\n".join(S) + "\n")

if __name__ == "__main__":
    maestros()
    cargas(f"{D}/cargas_v1", "03_seed_cargas_v1_con_errores.sql", "RECIBIDA")
    cargas(f"{D}/cargas_v2", "04_seed_cargas_v2.sql", "RECIBIDA")
    print("OK")
