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
  const prompt = `Eres un analista que escribe para "El Gato Lector", un boletín de noticias sin ánimo de lucro sobre seguridad, justicia y paz.

A partir de estos titulares recientes sobre ${label}, escribe un breve análisis cruzado organizado en estas categorías exactas: ${categoryList}.

Titulares:
${headlines}

Para cada categoría escribe entre 2 y 4 oraciones en español, con tono analítico y sobrio, conectando los titulares relevantes con su posible contexto o implicaciones. No inventes datos que no estén respaldados por los titulares; si una categoría no tiene titulares relacionados, ofrece una reflexión general breve sobre esa dimensión en el contexto actual.

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
  console.log("Listo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
