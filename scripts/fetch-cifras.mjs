#!/usr/bin/env node
// Pipeline de datos — "Gato en Cifras" (Paso 1)
// Descarga SIEDCO, calcula tasas x100k y discrepancias, escribe cifras.data.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── IDs verificados en vivo el 2026-07-14 ───────────────────────────────────
const DATASETS = {
  homicidio:      { id: 'm8fd-ahd9', nombre: 'HOMICIDIO — Policía Nacional (SIEDCO)' },
  hurto_personas: { id: '4rxi-8m8d', nombre: 'HURTO A PERSONAS — Policía Nacional (SIEDCO)' },
  extorsion:      { id: 'q2ib-t9am', nombre: 'EXTORSIÓN — Policía Nacional (SIEDCO)' },
};
const SODA_BASE = 'https://www.datos.gov.co/resource';
const DESDE_ANIO = 2019;   // quiebre metodológico SIEDCO-SPOA 2016-2018
const BASE_MINIMA = 20;    // menos de este nº de casos → variación % suprimida

// ── Cargar datos preparados ──────────────────────────────────────────────────
const poblacionData = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'poblacion.dane.json'), 'utf-8')
);
const medlegData = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'homicidios.medicinalegal.json'), 'utf-8')
);

const pobByDivipola  = Object.fromEntries(poblacionData.municipios.map(m => [m.divipola, m]));
const medlegByDiv    = Object.fromEntries(medlegData.municipios.map(m => [m.divipola, m]));
const capitalesCodes = new Set(Object.keys(medlegByDiv));
const allCodes       = poblacionData.municipios.map(m => m.divipola);

// ── Consulta SODA con agregación mensual (server-side) ──────────────────────
async function fetchMensual(datasetId, codes) {
  const codesStr = codes.map(c => `'${c}'`).join(',');
  const params = new URLSearchParams({
    '$select': 'cod_muni,municipio,date_trunc_ym(fecha_hecho) as anio_mes,sum(cantidad) as total',
    '$where':  `cod_muni IN (${codesStr}) AND fecha_hecho >= '${DESDE_ANIO}-01-01T00:00:00'`,
    '$group':  'cod_muni,municipio,anio_mes',
    '$order':  'cod_muni,anio_mes',
    '$limit':  '50000',
  });
  const url = `${SODA_BASE}/${datasetId}.json?${params}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} en ${datasetId}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Índice mensual por municipio: { cod_muni → { "2025-01" → nº } } ─────────
function indexarMensual(rows) {
  const idx = {};
  for (const row of rows) {
    const cod = row.cod_muni;
    if (!idx[cod]) idx[cod] = {};
    const ym = row.anio_mes.slice(0, 7); // "2026-01-01T..." → "2026-01"
    idx[cod][ym] = (idx[cod][ym] ?? 0) + parseInt(row.total, 10);
  }
  return idx;
}

// ── Sumar casos en un rango de meses de un año ──────────────────────────────
function sumar(idx, cod, anio, meses) {
  const m = idx[cod] ?? {};
  return meses.reduce((s, n) => s + (m[`${anio}-${String(n).padStart(2, '0')}`] ?? 0), 0);
}

// ── Tasa x100k (1 decimal) ───────────────────────────────────────────────────
function tasa(casos, pob) {
  if (!pob) return null;
  return Math.round((casos / pob) * 100000 * 10) / 10;
}

// ── Variación porcentual con control de base pequeña ────────────────────────
function variacion(anterior, actual) {
  if (!anterior || anterior === 0) return { valor: null, base_pequena: false };
  if (anterior < BASE_MINIMA)     return { valor: null, base_pequena: true  };
  return {
    valor: Math.round(((actual - anterior) / anterior) * 1000) / 10,
    base_pequena: false,
  };
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('▶  Gato en Cifras — Paso 1: descargando SIEDCO...\n');

  const ENE_ABR = [1, 2, 3, 4];
  const AÑO_COMPLETO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // Descargar los tres datasets en paralelo
  const [rowsHom, rowsHurto, rowsExt] = await Promise.all([
    fetchMensual(DATASETS.homicidio.id,      allCodes),
    fetchMensual(DATASETS.hurto_personas.id, allCodes),
    fetchMensual(DATASETS.extorsion.id,      allCodes),
  ]);

  console.log(`  Homicidio Policía:  ${rowsHom.length.toLocaleString()} filas mensuales`);
  console.log(`  Hurto a personas:   ${rowsHurto.length.toLocaleString()} filas mensuales`);
  console.log(`  Extorsión:          ${rowsExt.length.toLocaleString()} filas mensuales`);
  console.log('');

  const homIdx   = indexarMensual(rowsHom);
  const hurtoIdx = indexarMensual(rowsHurto);
  const extIdx   = indexarMensual(rowsExt);

  // ── Construir resultado por municipio ───────────────────────────────────
  const municipiosResult = [];
  const sinDatoPolicia   = [];

  for (const pob of poblacionData.municipios) {
    const cod       = pob.divipola;
    const esCapital = capitalesCodes.has(cod);
    const ml        = medlegByDiv[cod] ?? null;

    // — Homicidio Policía —
    const hom25 = sumar(homIdx, cod, 2025, AÑO_COMPLETO);
    const hom25ea = sumar(homIdx, cod, 2025, ENE_ABR);
    const hom26ea = sumar(homIdx, cod, 2026, ENE_ABR);
    const varHom  = variacion(hom25ea, hom26ea);

    if (hom25 === 0 && hom25ea === 0 && hom26ea === 0) sinDatoPolicia.push(pob.municipio);

    // — Hurto a personas —
    const hur25   = sumar(hurtoIdx, cod, 2025, AÑO_COMPLETO);
    const hur25ea = sumar(hurtoIdx, cod, 2025, ENE_ABR);
    const hur26ea = sumar(hurtoIdx, cod, 2026, ENE_ABR);
    const varHur  = variacion(hur25ea, hur26ea);

    // — Extorsión —
    const ext25   = sumar(extIdx, cod, 2025, AÑO_COMPLETO);
    const ext25ea = sumar(extIdx, cod, 2025, ENE_ABR);
    const ext26ea = sumar(extIdx, cod, 2026, ENE_ABR);
    const varExt  = variacion(ext25ea, ext26ea);

    // — Discrepancia Policía vs MedLeg (solo capitales) —
    let discrepancia = null;
    if (esCapital && ml) {
      const polEA  = hom26ea;
      const mlEA   = ml.homicidios_2026_ene_abr;
      const difAbs = polEA - mlEA;
      const difPct = mlEA > 0 ? Math.round((difAbs / mlEA) * 1000) / 10 : null;
      discrepancia = {
        periodo: 'ene-abr 2026',
        policia: polEA,
        medleg:  mlEA,
        diferencia_abs: difAbs,
        diferencia_pct: difPct,
        nota: 'Cifras sujetas a variación (Policía) y preliminares (Medicina Legal)',
      };
    }

    municipiosResult.push({
      municipio:     pob.municipio,
      divipola:      cod,
      es_capital:    esCapital,
      poblacion_2025: pob.poblacion_2025,
      poblacion_2026: pob.poblacion_2026,

      homicidio: {
        policia: {
          casos_2025_completo: hom25  || null,
          casos_2025_ene_abr:  hom25ea || null,
          casos_2026_ene_abr:  hom26ea || null,
          variacion_pct_ene_abr:  varHom.valor,
          base_pequena:           varHom.base_pequena,
          // Tasas
          tasa_2025:              tasa(hom25,  pob.poblacion_2025),
          tasa_2026_ene_abr:      tasa(hom26ea, pob.poblacion_2026),
          tasa_2026_proyectada:   pob.poblacion_2026
            ? Math.round((hom26ea * 3 / pob.poblacion_2026) * 100000 * 10) / 10
            : null,
        },
        medleg: esCapital && ml ? {
          casos_2025_completo:     ml.homicidios_2025_completo,
          casos_2025_ene_abr:      ml.homicidios_2025_ene_abr,
          casos_2026_ene_abr:      ml.homicidios_2026_ene_abr,
          variacion_pct_ene_abr:   ml.variacion_pct_ene_abr,
          base_pequena:            ml.homicidios_2025_ene_abr < BASE_MINIMA,
          direccion:               ml.direccion,
          // Tasas (usando población del mismo año)
          tasa_2025:    tasa(ml.homicidios_2025_completo, pob.poblacion_2025),
          tasa_2026_ea: tasa(ml.homicidios_2026_ene_abr,  pob.poblacion_2026),
          tasa_2026_proyectada: pob.poblacion_2026
            ? Math.round((ml.homicidios_2026_ene_abr * 3 / pob.poblacion_2026) * 100000 * 10) / 10
            : null,
        } : null,
        discrepancia,
      },

      hurto_personas: {
        policia: {
          casos_2025_completo:   hur25   || null,
          casos_2025_ene_abr:    hur25ea || null,
          casos_2026_ene_abr:    hur26ea || null,
          variacion_pct_ene_abr: varHur.valor,
          base_pequena:          varHur.base_pequena,
          tasa_2025:             tasa(hur25,  pob.poblacion_2025),
          tasa_2026_ene_abr:     tasa(hur26ea, pob.poblacion_2026),
          tasa_2026_proyectada:  pob.poblacion_2026
            ? Math.round((hur26ea * 3 / pob.poblacion_2026) * 100000 * 10) / 10
            : null,
        },
      },

      extorsion: {
        policia: {
          casos_2025_completo:   ext25   || null,
          casos_2025_ene_abr:    ext25ea || null,
          casos_2026_ene_abr:    ext26ea || null,
          variacion_pct_ene_abr: varExt.valor,
          base_pequena:          varExt.base_pequena,
          tasa_2025:             tasa(ext25,  pob.poblacion_2025),
          tasa_2026_ene_abr:     tasa(ext26ea, pob.poblacion_2026),
          tasa_2026_proyectada:  pob.poblacion_2026
            ? Math.round((ext26ea * 3 / pob.poblacion_2026) * 100000 * 10) / 10
            : null,
        },
      },
    });
  }

  // ── Resumen de validación ────────────────────────────────────────────────
  const totMunicipios  = municipiosResult.length;
  const conHomicidio   = municipiosResult.filter(m => m.homicidio.policia.casos_2025_completo).length;
  const conHurto       = municipiosResult.filter(m => m.hurto_personas.policia.casos_2025_completo).length;
  const conExt         = municipiosResult.filter(m => m.extorsion.policia.casos_2025_completo).length;
  const conDiscrep     = municipiosResult.filter(m => m.homicidio.discrepancia).length;

  // Verificar totales capitales contra referencia MedLeg
  const polTot25Capitales = municipiosResult
    .filter(m => m.es_capital)
    .reduce((s, m) => s + (m.homicidio.policia.casos_2025_completo ?? 0), 0);
  const mlTot25Capitales  = 5759; // de periodos["2025_completo"].total_32_capitales

  console.log('── RESUMEN DE VALIDACIÓN ─────────────────────────────────────');
  console.log(`  Municipios en output:              ${totMunicipios} / 38`);
  console.log(`  Con datos homicidio Policía 2025:  ${conHomicidio}  / ${totMunicipios}`);
  console.log(`  Con datos hurto personas 2025:     ${conHurto}  / ${totMunicipios}`);
  console.log(`  Con datos extorsión 2025:          ${conExt}  / ${totMunicipios}`);
  console.log(`  Capitales con contador discrepancias: ${conDiscrep} / 32`);
  console.log('');
  console.log(`  Total hom. 2025 Policía (32 cap): ${polTot25Capitales.toLocaleString()}`);
  console.log(`  Total hom. 2025 MedLeg  (32 cap): ${mlTot25Capitales.toLocaleString()}  ← referencia`);
  console.log(`  Brecha macro 2025:                 ${(polTot25Capitales - mlTot25Capitales).toLocaleString()} casos`);
  console.log('');

  if (sinDatoPolicia.length) {
    console.log(`⚠  Sin datos Policía homicidio (aparecerán como "sin dato"):`);
    sinDatoPolicia.forEach(m => console.log(`     - ${m}`));
    console.log('');
  }

  // ── Armar JSON de salida ─────────────────────────────────────────────────
  const mln = medlegData.comparacion_nacional_misma_ventana;
  const mlp = medlegData.periodos;

  const output = {
    meta: {
      generatedAt:   new Date().toISOString(),
      corte_policia: '2026-05-31',
      corte_medleg: {
        completo_2025: mlp['2025_completo']?.etiqueta  ?? 'ene-dic 2025 (pr)',
        parcial_2025:  mlp['2025_ene_abr']?.etiqueta   ?? 'ene-abr 2025 (pr)',
        parcial_2026:  mlp['2026_ene_abr']?.etiqueta   ?? 'ene-abr 2026 (pr)',
      },
      fuentes: {
        homicidio_policia:  `${SODA_BASE}/${DATASETS.homicidio.id}.json`,
        hurto_personas:     `${SODA_BASE}/${DATASETS.hurto_personas.id}.json`,
        extorsion:          `${SODA_BASE}/${DATASETS.extorsion.id}.json`,
        homicidio_medleg:   'INMLCF — SIRDEC/GNAGD. Boletines mensuales 2025-2026.',
        poblacion:          'DANE — Proyecciones Municipales 2018-2042 (CNPV 2018)',
      },
      advertencias: [
        'Cifras Policía Nacional: sujetas a variación posterior',
        'Cifras Medicina Legal 2025-2026: preliminares (pr)',
        'Series comparables desde 2019; quiebre SIEDCO-SPOA en 2016-2018',
        'Variación % suprimida cuando base < 20 casos (campo base_pequena: true)',
        'Tasa proyectada = casos ene-abr × 3; ETIQUETADA como proyección anual',
        'Rankings y mapa: siempre por tasa x100k, nunca por absoluto',
      ],
      ids_verificados: {
        homicidio:      DATASETS.homicidio.id,
        hurto_personas: DATASETS.hurto_personas.id,
        extorsion:      DATASETS.extorsion.id,
        verificado_el:  '2026-07-14',
        verificado_con: '?$limit=3 en cada dataset',
      },
    },
    nacional: {
      homicidio_medleg: {
        fuente:              medlegData.meta.fuente,
        ventana_comparacion: mln.ventana,
        casos_2025:          mln.homicidios_2025,
        casos_2026:          mln.homicidios_2026,
        variacion_pct:       5.76,
        variacion_absoluta:  mln.variacion_absoluta,
        direccion:           mln.direccion,
        nota:                mln.nota,
      },
      homicidio_capitales_medleg: {
        ventana: 'ene-abr',
        total_2025: mlp['2025_ene_abr']?.total_32_capitales ?? 1782,
        total_2026: mlp['2026_ene_abr']?.total_32_capitales ?? 1857,
        variacion_pct: medlegData.comparacion_por_ciudad_ene_abr?.variacion_pct ?? 4.21,
      },
    },
    municipios: municipiosResult,
  };

  // ── Escribir archivos de salida ──────────────────────────────────────────
  const outData = path.join(ROOT, 'src', 'data', 'cifras.data.json');
  fs.writeFileSync(outData, JSON.stringify(output, null, 2));
  console.log(`✓ src/data/cifras.data.json  (${municipiosResult.length} municipios)`);

  const outConfig = path.join(ROOT, 'fuentes.config.json');
  fs.writeFileSync(outConfig, JSON.stringify({
    generado:     new Date().toISOString(),
    nota:         'IDs de datasets SIEDCO verificados con consulta en vivo. Reverificar en cada ciclo mensual con ?$limit=3.',
    corte_actual: '2026-05-31',
    datasets:     Object.fromEntries(
      Object.entries(DATASETS).map(([k, v]) => [k, {
        id:     v.id,
        url:    `${SODA_BASE}/${v.id}.json`,
        nombre: v.nombre,
      }])
    ),
  }, null, 2));
  console.log('✓ fuentes.config.json');
  console.log('─────────────────────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('✗ Error:', err.message);
  process.exit(1);
});
