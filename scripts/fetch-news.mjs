// Descarga titulares (RSS) de cada medio configurado en src/data/feeds.config.json
// y los indicadores economicos (TRM, dolar, euro), y escribe los JSON que
// consumen las paginas de Astro. Pensado para correr a diario desde
// GitHub Actions (ver .github/workflows/daily-update.yml).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "src", "data");

const parser = new Parser({
  timeout: 15000,
  maxRedirects: 5,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; ElGatoLectorBot/1.0; +https://github.com/) RSS reader",
  },
});

const LOCALES = {
  es: { hl: "es-419", gl: "CO", ceid: "CO:es-419" },
  en: { hl: "en-US", gl: "US", ceid: "US:en" },
};

function buildGoogleNewsUrl(query, locale = "es", when = "7d") {
  const params = new URLSearchParams({ q: `${query} when:${when}`, ...LOCALES[locale] });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

// Google Noticias entrega titulos como "Titular - Nombre del medio"
function cleanGoogleTitle(title) {
  return title.replace(/\s+-\s+[^-]+$/, "").trim();
}

// Algunos sitios (p.ej. weforum.org) son indexados por Google Noticias sobre todo
// a traves de paginas de perfil de autor, cuyo "titular" es solo un nombre propio
// (2 a 4 palabras, todas con mayuscula inicial, sin conectores en minuscula).
// Esos resultados se descartan porque no son noticias.
const AUTHOR_NAME_RE = /^([A-ZÁÉÍÓÚÑ][a-zA-ZÁÉÍÓÚÑáéíóúñ'-]*\s*){2,4}$/;
function looksLikeAuthorName(title) {
  return AUTHOR_NAME_RE.test(title);
}

// Recorta un resumen a una longitud razonable para tarjetas destacadas.
function truncateSnippet(text, maxLength = 280) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trim()}…`;
}

async function fetchOutletItems(outlet) {
  const items = [];

  for (const feed of outlet.feeds) {
    const url =
      feed.type === "google" ? buildGoogleNewsUrl(feed.query, feed.locale, feed.when) : feed.url;
    try {
      const parsed = await parser.parseURL(url);
      for (const item of parsed.items || []) {
        if (!item.link) continue;
        const rawTitle = (item.title || "").trim();
        const title = feed.type === "google" ? cleanGoogleTitle(rawTitle) : rawTitle;
        if (!title) continue;
        if (feed.type === "google" && looksLikeAuthorName(title)) continue;
        // Los resultados de Google Noticias no traen un resumen util (solo
        // enlaces relacionados), asi que el snippet solo se usa para RSS directo.
        const rawSnippet = feed.type === "rss" ? item.contentSnippet || item.summary : null;
        const snippet = rawSnippet ? truncateSnippet(rawSnippet) : null;
        items.push({
          title,
          link: item.link,
          pubDate: item.isoDate || item.pubDate || null,
          snippet,
        });
      }
    } catch (err) {
      console.warn(`  [aviso] ${outlet.name}: fallo al leer ${url} -> ${err.message}`);
    }
  }

  // quitar duplicados, ordenar por fecha desc, recortar al limite configurado
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    deduped.push(item);
  }
  deduped.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return deduped.slice(0, outlet.limit || 5);
}

async function buildSection(outlets) {
  const result = [];
  for (const outlet of outlets) {
    const items = await fetchOutletItems(outlet);
    console.log(`  - ${outlet.name}: ${items.length} titular(es)`);
    result.push({ name: outlet.name, color: outlet.color, items });
  }
  return result;
}

// Elige "la noticia del dia": la mas reciente entre los medios que traen
// resumen (RSS directo), para poder mostrar un parrafo descriptivo.
function pickFeaturedStory(...sections) {
  const candidates = [];
  for (const outlets of sections) {
    for (const outlet of outlets) {
      for (const item of outlet.items) {
        if (!item.snippet) continue;
        candidates.push({ ...item, source: outlet.name });
      }
    }
  }
  candidates.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return candidates[0] || null;
}

async function fetchTRM() {
  const res = await fetch(
    "https://www.datos.gov.co/resource/mcec-87by.json?$order=vigenciadesde%20DESC&$limit=1",
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return Number(json[0]?.valor);
}

async function fetchFx() {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.result !== "success") throw new Error("respuesta sin exito");
  return { dolar: json.rates.COP, euro: json.rates.COP / json.rates.EUR };
}

// Precio de un futuro/commodity desde Yahoo Finance (API publica, sin clave).
async function fetchYahooQuote(symbol) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
    { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof price !== "number") throw new Error("sin precio");
  return price;
}

async function fetchCommodities() {
  const result = { brent: null, cafe: null };
  try {
    // Brent crude oil (USD por barril)
    result.brent = await fetchYahooQuote("BZ=F");
  } catch (err) {
    console.warn(`  [aviso] Brent: ${err.message}`);
  }
  try {
    // Cafe arabica ICE, cotiza en centavos de USD por libra -> USD/libra
    const centavos = await fetchYahooQuote("KC=F");
    result.cafe = centavos / 100;
  } catch (err) {
    console.warn(`  [aviso] Cafe: ${err.message}`);
  }
  return result;
}

// Ciudades para la seccion de clima (Open-Meteo, API publica sin clave).
const WEATHER_CITIES = {
  colombia: [
    { city: "Bogotá", lat: 4.711, lon: -74.0721 },
    { city: "Medellín", lat: 6.2442, lon: -75.5812 },
    { city: "Cali", lat: 3.4516, lon: -76.532 },
    { city: "Cartagena", lat: 10.391, lon: -75.4794 },
    { city: "Barranquilla", lat: 10.9685, lon: -74.7813 },
  ],
  mundo: [
    { city: "Nueva York", lat: 40.7128, lon: -74.006 },
    { city: "Londres", lat: 51.5074, lon: -0.1278 },
    { city: "Madrid", lat: 40.4168, lon: -3.7038 },
    { city: "Tokio", lat: 35.6762, lon: 139.6503 },
    { city: "Ciudad de México", lat: 19.4326, lon: -99.1332 },
  ],
};

// Codigos de tiempo WMO -> { descripcion, icono }
// https://open-meteo.com/en/docs (campo weathercode)
function describeWeatherCode(code) {
  const table = {
    0: ["Despejado", "☀️"],
    1: ["Mayormente despejado", "🌤️"],
    2: ["Parcialmente nublado", "⛅"],
    3: ["Nublado", "☁️"],
    45: ["Niebla", "🌫️"],
    48: ["Niebla helada", "🌫️"],
    51: ["Llovizna ligera", "🌦️"],
    53: ["Llovizna", "🌦️"],
    55: ["Llovizna intensa", "🌦️"],
    56: ["Llovizna helada", "🌦️"],
    57: ["Llovizna helada intensa", "🌦️"],
    61: ["Lluvia ligera", "🌧️"],
    63: ["Lluvia", "🌧️"],
    65: ["Lluvia intensa", "🌧️"],
    66: ["Lluvia helada", "🌧️"],
    67: ["Lluvia helada intensa", "🌧️"],
    71: ["Nevada ligera", "❄️"],
    73: ["Nevada", "❄️"],
    75: ["Nevada intensa", "❄️"],
    77: ["Granizo fino", "❄️"],
    80: ["Lluvias dispersas", "🌦️"],
    81: ["Lluvias", "🌦️"],
    82: ["Lluvias intensas", "🌧️"],
    85: ["Nevadas dispersas", "🌨️"],
    86: ["Nevadas intensas", "🌨️"],
    95: ["Tormenta", "⛈️"],
    96: ["Tormenta con granizo", "⛈️"],
    99: ["Tormenta con granizo fuerte", "⛈️"],
  };
  return table[code] || ["Sin datos", "🌡️"];
}

async function fetchCityWeather({ city, lat, lon }) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const current = json.current_weather;
  if (!current) throw new Error("sin datos actuales");
  const [description, icon] = describeWeatherCode(current.weathercode);
  return { city, temp: Math.round(current.temperature), description, icon };
}

async function fetchWeather() {
  const result = { colombia: [], mundo: [] };
  for (const region of ["colombia", "mundo"]) {
    for (const place of WEATHER_CITIES[region]) {
      try {
        result[region].push(await fetchCityWeather(place));
      } catch (err) {
        console.warn(`  [aviso] clima ${place.city}: ${err.message}`);
      }
    }
  }
  return result;
}

async function fetchIndicators() {
  let previous = null;
  try {
    previous = JSON.parse(await readFile(path.join(DATA_DIR, "indicators.json"), "utf-8"));
  } catch {
    // primera ejecucion: no hay datos previos
  }

  const current = { trm: null, dolar: null, euro: null, brent: null, cafe: null };

  try {
    current.trm = await fetchTRM();
  } catch (err) {
    console.warn(`  [aviso] TRM: ${err.message}`);
  }

  try {
    const fx = await fetchFx();
    current.dolar = fx.dolar;
    current.euro = fx.euro;
  } catch (err) {
    console.warn(`  [aviso] tasas de cambio: ${err.message}`);
  }

  const commodities = await fetchCommodities();
  current.brent = commodities.brent;
  current.cafe = commodities.cafe;

  const result = { updatedAt: new Date().toISOString() };
  for (const key of ["trm", "dolar", "euro", "brent", "cafe"]) {
    const value = current[key] ?? previous?.[key] ?? null;
    const previousValue = previous?.[key] ?? null;
    let trend = "flat";
    if (typeof value === "number" && typeof previousValue === "number") {
      if (value > previousValue) trend = "up";
      else if (value < previousValue) trend = "down";
    }
    result[key] = value;
    result[`${key}Trend`] = trend;
  }

  return result;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const config = JSON.parse(
    await readFile(path.join(DATA_DIR, "feeds.config.json"), "utf-8"),
  );

  console.log("Obteniendo noticias de Colombia...");
  const colombia = await buildSection(config.colombia);

  console.log("Obteniendo noticias del mundo...");
  const mundo = await buildSection(config.mundo);

  console.log("Obteniendo investigaciones recomendadas...");
  const recomendados = await buildSection(config.recomendados);

  const generatedAt = new Date().toISOString();
  await writeFile(
    path.join(DATA_DIR, "news-colombia.json"),
    JSON.stringify({ generatedAt, outlets: colombia }, null, 2) + "\n",
  );
  await writeFile(
    path.join(DATA_DIR, "news-mundo.json"),
    JSON.stringify({ generatedAt, outlets: mundo }, null, 2) + "\n",
  );
  await writeFile(
    path.join(DATA_DIR, "news-recomendados.json"),
    JSON.stringify({ generatedAt, outlets: recomendados }, null, 2) + "\n",
  );

  console.log("Eligiendo la noticia del dia...");
  const featured = pickFeaturedStory(colombia, mundo);
  await writeFile(
    path.join(DATA_DIR, "featured.json"),
    JSON.stringify({ generatedAt, story: featured }, null, 2) + "\n",
  );

  console.log("Obteniendo indicadores economicos...");
  const indicators = await fetchIndicators();
  await writeFile(
    path.join(DATA_DIR, "indicators.json"),
    JSON.stringify(indicators, null, 2) + "\n",
  );

  console.log("Obteniendo el clima de las ciudades...");
  const weather = await fetchWeather();
  await writeFile(
    path.join(DATA_DIR, "weather.json"),
    JSON.stringify({ generatedAt, ...weather }, null, 2) + "\n",
  );

  console.log("Listo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
