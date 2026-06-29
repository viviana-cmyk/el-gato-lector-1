# El Gato Lector — instrucciones para Claude

## Política de noticias

**Si un medio de comunicación no tiene noticias recientes en la ventana de extracción, SIEMPRE se deben conservar y publicar las últimas noticias encontradas para ese medio.**

No dejar ningún medio con "Sin titulares disponibles por ahora" si hay datos previos disponibles. La lógica de respaldo en `scripts/fetch-news.mjs` implementa esto así:
1. Intenta ventana de 12 horas.
2. Si está vacío, amplía a 24 horas.
3. Si sigue vacío, usa el JSON del día anterior (`news-colombia.json` / `news-mundo.json`).

Esta política no debe revertirse ni debilitarse.

## Horario de actualización

El sitio se actualiza todos los días a las **5:00 AM hora Colombia (UTC-5 = 10:00 UTC)**.  
El disparador es **cron-job.org** (configurado en America/Bogota) via `workflow_dispatch`.  
El `schedule` interno de GitHub Actions fue eliminado porque atrasaba horas y generaba ejecuciones duplicadas.

## Priorización de noticias

Las noticias se ordenan por **importancia temática**, no por hora de publicación:
- **ALTA**: política, economía, seguridad, ciencia, crisis → primero y de mayor a menor impacto
- **DEPORTES**: solo relevancia nacional (Mundial, Copa) → al final
- **EXCLUIR**: farándula, moda, loterías, entretenimiento → eliminadas

La ventana de candidatos es de 12 horas (ampliable a 24h), con hasta 3× el límite por medio para que la IA tenga más opciones.
