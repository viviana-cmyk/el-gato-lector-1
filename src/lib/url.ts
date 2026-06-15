// Antepone el "base path" del sitio (configurado en astro.config.mjs) a una
// ruta absoluta. Necesario para que los enlaces y assets funcionen tanto si el
// sitio se publica en la raiz (https://usuario.github.io/) como en una
// subruta de proyecto (https://usuario.github.io/el-gato-lector/).
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  const trimmedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmedBase}${path}`;
}
