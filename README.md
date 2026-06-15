# El Gato Lector 🐈‍⬛

Sitio estático que recopila cada día los titulares más recientes de medios de
Colombia y del mundo, junto con la noticia destacada del día, un análisis
generado con IA ("Reflexiones del Gato"), indicadores económicos (TRM, dólar,
euro, petróleo Brent y café), el clima de las principales ciudades, las
tendencias top 5 de redes sociales y podcasts, y el calendario del Mundial
2026 e investigaciones/recomendados de seguridad, justicia y paz. Se actualiza
solo, todos los días a las **6:00 a.m. (hora de Colombia)**, mediante GitHub
Actions.

> Recopilación sin ánimo de lucro en temas de seguridad, justicia y paz,
> realizada desde la curiosidad innata de los gatos. Lee, actualízate y
> edifica tus propias conjeturas a partir de datos, tendencias y
> contemporaneidad.

## Cómo funciona

1. **`scripts/fetch-news.mjs`** lee `src/data/feeds.config.json`, descarga los
   titulares de cada medio (RSS directo o Google Noticias como respaldo), la
   noticia destacada, los indicadores económicos y el clima, y escribe los
   resultados en `src/data/*.json`.
2. **`scripts/generate-analysis.mjs`** usa la API de Anthropic (Claude) para
   redactar la sección "Reflexiones del Gato" (Colombia y Mundo) a partir de
   los titulares del día y escribe `src/data/analisis.json`. Si no hay una
   clave configurada, conserva el análisis anterior o muestra un texto de
   aviso.
3. **Astro** (`src/pages/*.astro`) lee esos JSON en tiempo de build y genera un
   sitio 100% estático (`npm run build` → carpeta `dist/`).
4. **GitHub Actions** (`.github/workflows/daily-update.yml`) ejecuta los pasos
   1 y 2 todos los días a las 11:00 UTC (06:00 Colombia, sin horario de
   verano), confirma los cambios en `src/data/*.json` y luego compila y
   publica el sitio en GitHub Pages.

## Estructura del proyecto

```
src/
├── data/
│   ├── feeds.config.json     # lista de medios y sus fuentes RSS/Google News
│   ├── curated.json           # libros, podcasts y tendencias destacadas (edición manual)
│   ├── worldcup.json          # calendario de partidos del Mundial 2026 (edición manual)
│   ├── news-colombia.json     # generado por fetch-news.mjs
│   ├── news-mundo.json        # generado por fetch-news.mjs
│   ├── news-recomendados.json # generado por fetch-news.mjs
│   ├── featured.json          # generado por fetch-news.mjs ("La noticia del día")
│   ├── weather.json           # generado por fetch-news.mjs (clima por ciudad)
│   ├── analisis.json          # generado por generate-analysis.mjs ("Reflexiones del Gato")
│   └── indicators.json        # generado por fetch-news.mjs (TRM, USD, EUR, Brent, Café)
├── components/                # IndicatorsBar, NewsGrid, OutletColumn, UpdatedNote,
│                               # FeaturedStory, AnalysisGrid, WeatherSection,
│                               # RankList, WorldCup
├── layouts/Layout.astro        # cabecera, navegación y pie de página
├── lib/
│   ├── format.ts               # formato de moneda, fechas y flechas de tendencia
│   ├── flags.ts                 # banderas (emoji) de los equipos del Mundial
│   └── url.ts                   # helper para rutas con base path de GitHub Pages
└── pages/
    ├── index.astro              # inicio (noticia del día, indicadores, clima y mundial)
    ├── colombia.astro            # todas las noticias de Colombia
    ├── mundo.astro               # todas las noticias del mundo
    ├── tendencias.astro          # top 5 en TikTok/Instagram/X y ranking de podcasts
    ├── reflexiones.astro         # "Reflexiones del Gato": análisis de Colombia y el mundo
    └── recomendados.astro        # investigaciones y libros
scripts/
├── fetch-news.mjs               # descarga noticias, indicadores y clima
├── generate-analysis.mjs        # genera la sección "Reflexiones del Gato" con IA (Anthropic)
└── screenshot.mjs               # capturas de pantalla con Playwright (verificación visual)
```

## Desarrollo local

```sh
npm install
npm run dev        # http://localhost:4321
```

Para regenerar las noticias, indicadores y clima localmente:

```sh
node scripts/fetch-news.mjs
```

Esto sobrescribe `src/data/news-*.json`, `src/data/indicators.json`,
`src/data/featured.json` y `src/data/weather.json` con datos frescos.
`indicators.json` además guarda el valor anterior para calcular las flechas y
colores de tendencia (▲ verde si sube, ▼ rojo si baja, = gris si no cambia).

Para generar la sección "Reflexiones del Gato" con IA (requiere una clave de
Anthropic, ver más abajo):

```sh
ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-analysis.mjs
```

Si no tienes la clave a mano, puedes ejecutarlo sin variable de entorno: el
sitio seguirá funcionando, solo que la sección "Reflexiones del Gato" mostrará
un texto de aviso en vez de un análisis nuevo.

Para compilar y previsualizar el sitio de producción:

```sh
npm run build
npm run preview
```

## Editar los medios (`src/data/feeds.config.json`)

Cada medio tiene esta forma:

```json
{
  "name": "El Tiempo",
  "color": "rose",
  "limit": 5,
  "feeds": [
    { "type": "rss", "url": "https://www.eltiempo.com/rss/colombia.xml" }
  ]
}
```

- **`type: "rss"`** — fuente RSS/Atom directa del medio (`url`).
- **`type: "google"`** — si el medio no tiene RSS estable, se usa Google
  Noticias como respaldo (`query`, normalmente `site:dominio.com`). Campos
  opcionales:
  - `"locale": "en"` — usa Google Noticias en inglés/EE. UU. en vez de
    español/Colombia (útil para medios como The Economist o The Washington
    Post).
  - `"when": "30d"` — amplía la ventana de tiempo de búsqueda (por defecto
    `7d`).
- **`limit`** — número de titulares a mostrar de ese medio.
- **`color`** — variante de color de la tarjeta (ver paleta en
  `src/styles/global.css`, clases `.outlet--*`).

Para agregar, quitar o reemplazar un medio, edita el arreglo correspondiente
(`colombia`, `mundo` o `recomendados`) y vuelve a correr
`node scripts/fetch-news.mjs` para probarlo localmente.

## Contenido editorial (`src/data/curated.json` y `src/data/worldcup.json`)

Estos archivos **no se regeneran automáticamente**: son contenido editorial
fijo que se edita a mano.

- **`curated.json`**
  - `books`: lista que alimenta la sección "Libros" de "Recomendados".
  - `tendencias.redes`: top 5 de temas/hashtags del día para TikTok,
    Instagram y X (`platform` y `top5`, un arreglo de 5 textos). Edita estos
    arreglos cada día con las tendencias reales de cada red.
  - `tendencias.podcasts.colombia` y `tendencias.podcasts.mundo`: top 5 de
    podcasts más escuchados en Colombia y en el mundo (`title` y `host` cada
    uno).
  - Todo esto se muestra en la página "Tendencias" como rankings numerados
    (01-05) con colores alternados; cada ítem enlaza al hashtag en la red
    correspondiente o a una búsqueda del podcast en Spotify.
- **`worldcup.json`**: calendario del Mundial 2026 que se muestra en
  "Mundial 2026 · Partidos", agrupado por día (`days`, cada uno con `date` y
  una lista `matches` de `home`/`away`/`time`). Actualiza `days` cada semana
  con la programación de los próximos partidos.

## Clave de IA para la sección "Reflexiones del Gato" (`ANTHROPIC_API_KEY`)

La sección "Reflexiones del Gato" se redacta automáticamente cada día con
Claude (modelo económico `claude-haiku-4-5`). Para activarla necesitas una
clave de la API de Anthropic. Si no la configuras, el sitio funciona igual,
pero esa sección muestra un texto de aviso en vez de un análisis nuevo.

Pasos (sin necesidad de saber programación):

1. Entra a [console.anthropic.com](https://console.anthropic.com/) y crea una
   cuenta (o inicia sesión).
2. En el menú lateral, ve a **API Keys** y crea una nueva clave. Cópiala (es
   un texto largo que empieza con `sk-ant-...`); solo se muestra una vez.
3. En **Billing**, agrega un método de pago. Es un servicio de pago por uso:
   generar el análisis diario con el modelo económico cuesta céntimos de
   dólar al mes.
4. En tu repositorio de GitHub, ve a **Settings → Secrets and variables →
   Actions → New repository secret**.
5. Crea un secreto con:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Secret:** la clave que copiaste en el paso 2.
6. Guarda. Desde la próxima ejecución del workflow, la sección "Reflexiones
   del Gato" se generará automáticamente.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube este proyecto (ver sección
   "Primeros pasos con git" abajo).
2. En **Settings → Pages**, selecciona **Source: GitHub Actions**.
3. En **Settings → Actions → General → Workflow permissions**, selecciona
   **Read and write permissions** (necesario para que el job diario pueda
   confirmar los archivos de datos actualizados en `src/data/`).
4. (Opcional) Configura el secreto `ANTHROPIC_API_KEY` como se explica arriba
   para activar la sección "Reflexiones del Gato".
5. ¡Listo! El workflow `.github/workflows/daily-update.yml`:
   - corre todos los días a las 6:00 a.m. (hora de Colombia),
   - actualiza `src/data/news-*.json`, `indicators.json`, `featured.json`,
     `weather.json` y `analisis.json`, y los confirma en `main`,
   - compila el sitio con Astro y lo publica en GitHub Pages.

   También puedes lanzarlo manualmente desde la pestaña **Actions → Actualizar
   noticias y publicar sitio → Run workflow**.

El sitio detecta automáticamente si se publica como página de
usuario/organización (`usuario.github.io`) o como página de proyecto
(`usuario.github.io/nombre-del-repo`) gracias a `actions/configure-pages` y al
helper `src/lib/url.ts`; no se necesita configuración adicional.

## Primeros pasos con git

```sh
git init
git add .
git commit -m "Sitio inicial de El Gato Lector"
git branch -M main
git remote add origin <url-de-tu-repositorio>
git push -u origin main
```
