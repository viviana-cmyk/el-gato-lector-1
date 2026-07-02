// Genera la seccion "Analisis" (Colombia / Mundo) usando la API de Anthropic,
// a partir de los titulares ya descargados por fetch-news.mjs. Si no hay
// ANTHROPIC_API_KEY configurada, o la llamada falla, se conserva el archivo
// anterior (o se escribe un texto de aviso si nunca se ha generado nada).

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "src", "data");
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const SECTIONS = {
  colombia: {
    file: "news-colombia.json",
    intro: "Lectura cruzada desde lo político, social, económico y cultural.",
    categories: ["Política", "Económica", "Social", "Cultural"],
    label: "Colombia",
  },
  mundo: {
    file: "news-mundo.json",
    intro: "Geopolítica, economía global, sociedad y tecnología en diálogo.",
    categories: ["Geopolítica", "Económica", "Tecnológica", "Social"],
    label: "el resto del mundo",
  },
};

function placeholderItems(categories, message) {
  return categories.map((category) => ({ category, text: message }));
}

async function readJson(file) {
  return JSON.parse(await readFile(path.join(DATA_DIR, file), "utf-8"));
}

function buildHeadlinesList(outlets, limit = 6) {
  const lines = [];
  for (const outlet of outlets) {
    for (const item of outlet.items.slice(0, limit)) {
      lines.push(`- (${outlet.name}) ${item.title}`);
    }
  }
  return lines.join("\n");
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("la respuesta no contiene JSON");
  return JSON.parse(match[0]);
}

async function generateSection(client, key) {
  const { file, intro, categories, label } = SECTIONS[key];
  const news = await readJson(file);
  const headlines = buildHeadlinesList(news.outlets);

  const categoryList = categories.map((c) => `"${c}"`).join(", ");
  const prompt = `Eres un analista experto que escribe para "El Gato Lector", un boletín de noticias sin ánimo de lucro sobre seguridad, justicia y paz.

A partir de los titulares recientes sobre ${label}, escribe un análisis cruzado organizado en estas categorías exactas: ${categoryList}.

Titulares:
${headlines}

Instrucciones de fondo y estilo:
- Postura estrictamente neutral y objetiva. No emitas juicios de valor, opiniones personales ni conclusiones subjetivas. Cíñete a hechos observables, evidencia disponible en los titulares y análisis técnico.
- Escritura natural y fluida, al estilo de un analista humano experto. Evita estructuras repetitivas, frases genéricas o lenguaje que suene a texto generado por IA ("es importante destacar", "en este contexto", "cabe señalar", "sin lugar a dudas", "en definitiva", etc.). No uses el guión largo (—) en ninguna parte del texto.
- Para cada categoría: 2 a 4 oraciones en español, conectando los titulares relevantes con su contexto o posibles implicaciones sin ir más allá de lo que los datos permiten inferir.
- Si una categoría no tiene titulares directamente relacionados, ofrece una observación breve y factual sobre esa dimensión en el panorama actual.
- No inventes datos, cifras ni fuentes que no estén en los titulares.
- Excluye completamente estos tipos de contenido aunque aparezcan en los titulares: rumores o especulaciones sin verificación, vida privada de celebridades o influencers (relaciones, familia, hábitos personales), apariencia o cambios físicos de personas públicas, conflictos personales entre famosos, "drama" o "beef" en redes sociales, información de fuentes anónimas, historias de infidelidades o romances.

Responde ÚNICAMENTE con un objeto JSON con esta forma exacta, sin texto adicional ni bloques de código:
{"items": [{"category": "<categoría>", "text": "<análisis>"}, ...]}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((block) => block.type === "text")?.text || "";
  const parsed = extractJson(text);
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error("respuesta sin 'items'");
  }
  return { intro, items: parsed.items };
}

async function generateTrends(client, headlinesColombia, headlinesMundo) {
  const prompt = `Eres el editor de El Gato Lector, boletín de noticias sobre política, seguridad, justicia y economía.

A partir de estos titulares priorizados del día, genera el Top 5 de tendencias para X (Twitter) y TikTok en Colombia y en el Mundo. Las tendencias deben:
- Estar directamente relacionadas con los temas ALTA (política, seguridad, economía, geopolítica, ciencia, crisis)
- Ser hashtags concisos y reales (sin inventar eventos que no aparezcan en los titulares)
- Reflejar el estilo de cada red: X más informativo/analítico, TikTok más directo y viral

Titulares Colombia:
${headlinesColombia}

Titulares Mundo:
${headlinesMundo}

Responde ÚNICAMENTE con este JSON exacto, sin texto adicional:
{
  "x": {
    "colombia": ["#Tag1","#Tag2","#Tag3","#Tag4","#Tag5"],
    "mundo": ["#Tag1","#Tag2","#Tag3","#Tag4","#Tag5"]
  },
  "tiktok": {
    "colombia": ["#Tag1","#Tag2","#Tag3","#Tag4","#Tag5"],
    "mundo": ["#Tag1","#Tag2","#Tag3","#Tag4","#Tag5"]
  }
}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content.find(b => b.type === "text")?.text || "";
  return extractJson(text);
}

async function generateDailyInfo(client, dateStr) {
  const prompt = `Hoy es ${dateStr}. ¿Hay algún día internacional oficial (ONU, UNESCO, OMS, OPS u organismo internacional reconocido) que se conmemore exactamente hoy?

Si existe, responde con este JSON exacto (sin texto adicional):
{"nombre":"<nombre completo en español>","descripcion":"<1 oración en español, máximo 180 caracteres, explicando qué se conmemora y por qué importa>"}

Si hoy no hay ningún día internacional oficial, responde exactamente con: null`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });
  const text = (response.content.find(b => b.type === "text")?.text || "").trim();
  if (text === "null" || text === "") return null;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch { return null; }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const generatedAt = new Date().toISOString();

  let previous = null;
  try {
    previous = await readJson("analisis.json");
  } catch {
    // primera ejecucion: no hay datos previos
  }

  const result = { generatedAt, colombia: null, mundo: null };

  if (!apiKey) {
    console.warn(
      "  [aviso] ANTHROPIC_API_KEY no configurada: se omite la generación de Análisis.",
    );
  }

  for (const key of Object.keys(SECTIONS)) {
    const { intro, categories } = SECTIONS[key];
    if (!apiKey) {
      result[key] = previous?.[key] || {
        intro,
        items: placeholderItems(
          categories,
          "Análisis pendiente: configura ANTHROPIC_API_KEY para generar este contenido automáticamente.",
        ),
      };
      continue;
    }

    try {
      const client = new Anthropic({ apiKey });
      result[key] = await generateSection(client, key);
      console.log(`  - Análisis ${key}: generado`);
    } catch (err) {
      console.warn(`  [aviso] Análisis ${key}: ${err.message}`);
      result[key] = previous?.[key] || {
        intro,
        items: placeholderItems(categories, "No se pudo generar el análisis de hoy."),
      };
    }
  }

  await writeFile(
    path.join(DATA_DIR, "analisis.json"),
    JSON.stringify(result, null, 2) + "\n",
  );

  // Día internacional del día
  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey });
      const dateStr = new Date().toLocaleDateString("es-CO", { day:"numeric", month:"long", year:"numeric", timeZone:"America/Bogota" });
      const diaInfo = await generateDailyInfo(client, dateStr);
      await writeFile(
        path.join(DATA_DIR, "dailyinfo.json"),
        JSON.stringify({ generatedAt, dia: diaInfo }, null, 2) + "\n",
      );
      console.log(`  - Día internacional: ${diaInfo ? diaInfo.nombre : "ninguno hoy"}`);
    } catch (err) {
      console.warn(`  [aviso] Día internacional: ${err.message}`);
    }
  }

  // Generar tendencias de X y TikTok con IA
  let prevTrends = null;
  try { prevTrends = await readJson("trends.json"); } catch { /* ok */ }

  if (apiKey) {
    try {
      const newsCO = await readJson("news-colombia.json");
      const newsMU = await readJson("news-mundo.json");
      const hCO = buildHeadlinesList(newsCO.outlets, 4);
      const hMU = buildHeadlinesList(newsMU.outlets, 4);
      const client = new Anthropic({ apiKey });
      const trends = await generateTrends(client, hCO, hMU);
      trends.generatedAt = generatedAt;
      await writeFile(
        path.join(DATA_DIR, "trends.json"),
        JSON.stringify(trends, null, 2) + "\n",
      );
      console.log("  - Tendencias X y TikTok: generadas");
    } catch (err) {
      console.warn(`  [aviso] Tendencias: ${err.message}`);
      if (prevTrends) await writeFile(path.join(DATA_DIR, "trends.json"), JSON.stringify(prevTrends, null, 2) + "\n");
    }
  }

  console.log("Listo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
