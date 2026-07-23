// Genera 3 recomendaciones de libros mensuales con IA, alineadas con los temas
// principales de El Gato Lector (política, seguridad, justicia, economía, paz).
// Lee los titulares actuales para que las recomendaciones sean pertinentes al mes.
// Actualiza únicamente el campo "books" en src/data/curated.json.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = path.join(__dirname, "..", "src", "data");
const MODEL      = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const COLORS     = ["blue", "mint", "rose", "yellow", "sky", "peach", "slate", "teal"];

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("la respuesta no contiene JSON");
  return JSON.parse(match[0]);
}

function buildHeadlines(outlets, limit = 5) {
  const lines = [];
  for (const o of outlets) {
    for (const item of (o.items || []).slice(0, limit)) {
      lines.push(`- ${item.title}`);
    }
  }
  return lines.join("\n");
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("  [aviso] ANTHROPIC_API_KEY no configurada: se omite la actualización de libros.");
    process.exit(0);
  }

  // Leer titulares actuales para contextualizar las recomendaciones
  let headlinesCO = "", headlinesMU = "";
  try {
    const co = JSON.parse(await readFile(path.join(DATA_DIR, "news-colombia.json"), "utf-8"));
    headlinesCO = buildHeadlines(co.outlets);
  } catch { /* ok, sin titulares */ }
  try {
    const mu = JSON.parse(await readFile(path.join(DATA_DIR, "news-mundo.json"), "utf-8"));
    headlinesMU = buildHeadlines(mu.outlets);
  } catch { /* ok, sin titulares */ }

  // Leer selección anterior para no repetir los mismos libros
  let prevBooks = [];
  try {
    const curated = JSON.parse(await readFile(path.join(DATA_DIR, "curated.json"), "utf-8"));
    prevBooks = (curated.books || []).map(b => `"${b.title}" de ${b.author}`);
  } catch { /* primera vez */ }

  const mesActual = new Date().toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" });
  const coloresDisp = COLORS.join(", ");

  const prompt = `Eres el editor de "El Gato Lector", un boletín enfocado en política, seguridad, justicia, economía y paz en Colombia y el mundo.

Mes actual: ${mesActual}

Titulares recientes Colombia:
${headlinesCO || "(no disponibles)"}

Titulares recientes Mundo:
${headlinesMU || "(no disponibles)"}

Libros del mes anterior (NO repetir ninguno):
${prevBooks.length ? prevBooks.join("\n") : "(ninguno)"}

Tu tarea: recomendar 3 libros para este mes. Criterios:
- Al menos uno debe relacionarse con los temas dominantes de los titulares anteriores.
- Los tres deben ser relevantes para el contexto político, social o de seguridad de Colombia/LatAm/mundo.
- Deben ser libros reales, verificables, de autores reconocidos. No inventes títulos ni autores.
- Variedad: no repitas el mismo tema o autor en los 3.
- Colores disponibles para asignar (uno diferente por libro): ${coloresDisp}
- El tag debe ser máximo 3 palabras (ej: "Geopolítica · IA", "Colombia · DDHH", "Economía · Crisis").
- La descripción: 2-3 oraciones en español, neutrales, que expliquen el aporte del libro al lector interesado en seguridad y política.

Responde ÚNICAMENTE con este JSON exacto, sin texto adicional:
{
  "books": [
    { "title": "<título>", "author": "<autor>", "color": "<color>", "tag": "<tag>", "description": "<descripción>" },
    { "title": "<título>", "author": "<autor>", "color": "<color>", "tag": "<tag>", "description": "<descripción>" },
    { "title": "<título>", "author": "<autor>", "color": "<color>", "tag": "<tag>", "description": "<descripción>" }
  ]
}`;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find(b => b.type === "text")?.text || "";
  const parsed = extractJson(text);

  if (!Array.isArray(parsed.books) || parsed.books.length !== 3) {
    throw new Error(`respuesta inválida: se esperaban 3 libros, se recibieron ${parsed.books?.length ?? 0}`);
  }

  // Leer curated.json completo y reemplazar solo "books"
  const curated = JSON.parse(await readFile(path.join(DATA_DIR, "curated.json"), "utf-8"));
  curated.books = parsed.books;

  await writeFile(
    path.join(DATA_DIR, "curated.json"),
    JSON.stringify(curated, null, 2) + "\n",
  );

  console.log(`  - Libros actualizados para ${mesActual}:`);
  parsed.books.forEach((b, i) => console.log(`    ${i + 1}. "${b.title}" — ${b.author}`));
  console.log("Listo.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
