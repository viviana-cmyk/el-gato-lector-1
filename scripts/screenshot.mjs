import { chromium } from "playwright";

const pages = [
  { path: "/", name: "home" },
  { path: "/colombia", name: "colombia" },
  { path: "/mundo", name: "mundo" },
  { path: "/recomendados", name: "recomendados" },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

for (const { path, name } of pages) {
  await page.goto(`http://localhost:4321${path}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `/tmp/shot-${name}.png`, fullPage: true });
  console.log(`saved /tmp/shot-${name}.png`);
}

await browser.close();
