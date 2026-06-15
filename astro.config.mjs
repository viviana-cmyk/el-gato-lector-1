// @ts-check
import { defineConfig } from 'astro/config';

// El workflow de GitHub Actions exporta BASE_PATH="/<nombre-del-repo>" cuando
// el sitio se publica como "pagina de proyecto"
// (https://<usuario>.github.io/<repo>/). Si se publica como pagina de
// usuario/organizacion (repo "<usuario>.github.io") o con dominio propio,
// BASE_PATH no se define y el sitio queda en la raiz ("/").
const base = process.env.BASE_PATH || '/';

// https://astro.build/config
export default defineConfig({
  base,
});
