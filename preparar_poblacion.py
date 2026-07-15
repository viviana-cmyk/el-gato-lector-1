#!/usr/bin/env python3
"""
preparar_poblacion.py  —  Kit de datos "Gato en Cifras"
------------------------------------------------------------------
Descarga el archivo OFICIAL de proyecciones de población municipal del DANE
(2018-2042) y extrae la población 2025 y 2026 de los 38 municipios definidos abajo,
generando 'poblacion.dane.json' listo para el pipeline del dashboard.

POR QUÉ ESTE SCRIPT: la población no tiene API. En vez de teclear 25 cifras
a mano (con riesgo de error), este script las toma directamente de la fuente
oficial. Así los números son reales y trazables.

REQUISITOS:  pip install requests pandas openpyxl
USO:         python preparar_poblacion.py
(Se corre en TU computador, que sí tiene acceso a dane.gov.co.)
"""

import json, sys, datetime
import requests
import pandas as pd
from io import BytesIO

# URL oficial DANE — Proyecciones de Población por Área y Municipio 2018-2042
URL_DANE = "https://www.dane.gov.co/files/censo2018/proyecciones-de-poblacion/Municipal/PPED-AreaMun-2018-2042_VP.xlsx"

ANIOS = [2025, 2026]  # años de población necesarios para calcular tasas
                      #   2025 -> tasas del año completo 2025
                      #   2026 -> tasas del año en curso 2026

# 38 municipios = 32 CIUDADES CAPITALES + 6 municipios grandes no capitales.
# Las 32 capitales son las que tienen datos de Medicina Legal (boletín mensual),
# por lo que en ellas funciona el CONTADOR DE DISCREPANCIAS (Policía vs. Med. Legal).
# Los 6 no capitales (Soacha, Soledad, Bello, Palmira, Itagüí, Floridablanca) solo
# tendrán datos de Policía: aparecen en mapa y ranking, pero sin módulo de discrepancias.
# El script valida cada código DIVIPOLA contra el archivo del DANE y avisa si alguno no coincide.
CIUDADES = [
    # --- 32 ciudades capitales ---
    ("Bogotá D.C.",           "11001"),
    ("Medellín",              "05001"),
    ("Santiago de Cali",      "76001"),
    ("Barranquilla",          "08001"),
    ("Cartagena de Indias",   "13001"),
    ("Cúcuta",                "54001"),
    ("Bucaramanga",           "68001"),
    ("Ibagué",                "73001"),
    ("Villavicencio",         "50001"),
    ("Santa Marta",           "47001"),
    ("Pereira",               "66001"),
    ("Valledupar",            "20001"),
    ("Montería",              "23001"),
    ("Pasto",                 "52001"),
    ("Manizales",             "17001"),
    ("Neiva",                 "41001"),
    ("Armenia",               "63001"),
    ("Popayán",               "19001"),
    ("Sincelejo",             "70001"),
    ("Riohacha",              "44001"),
    ("Quibdó",                "27001"),
    ("Tunja",                 "15001"),
    ("Florencia",             "18001"),
    ("Yopal",                 "85001"),
    ("Arauca",                "81001"),
    ("Mocoa",                 "86001"),
    ("San Andrés",            "88001"),
    ("Leticia",               "91001"),
    ("Inírida",               "94001"),
    ("San José del Guaviare", "95001"),
    ("Mitú",                  "97001"),
    ("Puerto Carreño",        "99001"),
    # --- 6 municipios grandes NO capitales (solo datos de Policía) ---
    ("Soacha",                "25754"),
    ("Soledad",               "08758"),
    ("Bello",                 "05088"),
    ("Palmira",               "76520"),
    ("Itagüí",                "05360"),
    ("Floridablanca",         "68276"),
]


def log(msg): print(f"  {msg}")


def descargar():
    log(f"Descargando archivo oficial del DANE…")
    r = requests.get(URL_DANE, timeout=120)
    r.raise_for_status()
    log(f"Descargado: {len(r.content)//1024} KB")
    return BytesIO(r.content)


def elegir_columna(cols, candidatas):
    """Devuelve el primer nombre de columna que contenga alguna palabra clave."""
    norm = {c: str(c).strip().lower() for c in cols}
    for cand in candidatas:
        for c, n in norm.items():
            if cand in n:
                return c
    return None


def main():
    print("\n=== PREPARAR POBLACIÓN DANE — Gato en Cifras ===\n")
    try:
        buf = descargar()
        # Estructura confirmada del archivo DANE (jul-2025):
        #   hoja de datos = 'PobMunicipalxÁrea'; la tabla arranca tras 7 filas de encabezado.
        SHEET = "PobMunicipalxÁrea"
        SKIP = 7
        df = pd.read_excel(buf, sheet_name=SHEET, skiprows=SKIP)
        log(f"Hoja '{SHEET}' leída (saltando {SKIP} filas de encabezado).")
    except Exception as e:
        print(f"\n[ERROR] No se pudo descargar/leer el archivo: {e}")
        print("Verifica tu conexión o descarga manualmente el .xlsx desde:")
        print(f"  {URL_DANE}\n")
        sys.exit(1)

    log(f"Columnas encontradas: {list(df.columns)}\n")

    # Nombres EXACTOS de columnas confirmados en el archivo DANE:
    #   MPIO = código DIVIPOLA | DPMP = nombre municipio | AÑO | ÁREA GEOGRÁFICA | TOTAL = población
    col_cod  = "MPIO"            if "MPIO"            in df.columns else elegir_columna(df.columns, ["mpio"])
    col_anio = "AÑO"             if "AÑO"             in df.columns else elegir_columna(df.columns, ["año", "ano", "anio"])
    col_area = "ÁREA GEOGRÁFICA" if "ÁREA GEOGRÁFICA" in df.columns else elegir_columna(df.columns, ["área", "area"])
    col_pob  = "TOTAL"           if "TOTAL"           in df.columns else elegir_columna(df.columns, ["total", "población", "poblacion"])

    if not (col_cod and col_anio and col_pob):
        print("[AVISO] No pude identificar automáticamente todas las columnas.")
        print("Revisa la lista de columnas de arriba y pégala en el chat.\n")
        sys.exit(1)

    # Normalizar código DIVIPOLA (viene como float, ej. '5001.0') y año (viene como float, ej. 2025.0)
    df[col_cod] = df[col_cod].astype(str).str.split(".").str[0].str.zfill(5)
    df["_anio"] = pd.to_numeric(df[col_anio], errors="coerce").astype("Int64")

    # Quedarnos con el TOTAL municipal (cabecera + resto rural), no las filas parciales
    if col_area:
        mask = df[col_area].astype(str).str.strip().str.lower().str.startswith("total")
        if mask.any():
            df = df[mask]

    resultado, faltantes = [], []
    for nombre, cod in CIUDADES:
        registro = {"municipio": nombre, "divipola": cod}
        for anio in ANIOS:
            fila = df[(df[col_cod] == cod) & (df["_anio"] == anio)]
            if fila.empty:
                registro[f"poblacion_{anio}"] = None
                faltantes.append(f"{nombre} ({cod}) año {anio}")
            else:
                registro[f"poblacion_{anio}"] = int(pd.to_numeric(fila[col_pob], errors="coerce").sum())
        # crecimiento poblacional entre los dos años (contexto útil)
        p_ini, p_fin = registro.get(f"poblacion_{ANIOS[0]}"), registro.get(f"poblacion_{ANIOS[-1]}")
        if p_ini and p_fin:
            registro["crecimiento_pct"] = round((p_fin - p_ini) / p_ini * 100, 2)
        resultado.append(registro)

    guardar(resultado, incompleto=bool(faltantes))
    if faltantes:
        print(f"[REVISAR] Sin población para: {', '.join(faltantes)}\n")
    else:
        print(f"[OK] Población {ANIOS[0]} y {ANIOS[-1]} extraída para los {len(CIUDADES)} municipios. ✔\n")


def guardar(municipios, incompleto):
    salida = {
        "meta": {
            "fuente": "DANE — Proyecciones de Población Municipal 2018-2042 (CNPV 2018)",
            "url_fuente": URL_DANE,
            "anios_incluidos": ANIOS,
            "fecha_preparacion": datetime.date.today().isoformat(),
            "estado": "INCOMPLETO — revisar faltantes" if incompleto else "COMPLETO",
            "uso": "Denominador para tasas x100.000 habitantes.",
            "REGLA": (
                "Usar la población del MISMO año que los casos. "
                "Tasa 2025 -> poblacion_2025. Tasa 2026 -> poblacion_2026. "
                "Para periodos parciales (ej. ene-abr 2026), anualizar los casos "
                "(casos x 12/meses) antes de dividir, y ETIQUETAR el resultado como proyección."
            ),
            "cobertura": (
                "38 municipios = 32 capitales (con datos de Medicina Legal, permiten el contador "
                "de discrepancias) + 6 no capitales (Soacha, Soledad, Bello, Palmira, Itagüí, "
                "Floridablanca; solo datos de Policía)."
            ),
        },
        "municipios": municipios,
    }
    with open("poblacion.dane.json", "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=2)
    print("Archivo generado: poblacion.dane.json")


if __name__ == "__main__":
    main()
