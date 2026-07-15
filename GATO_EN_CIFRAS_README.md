# Gato en Cifras — Guía de actualización mensual

Dashboard de seguridad ciudadana en Colombia: homicidios, hurto a personas y extorsión en 38 municipios, con tasas x100.000 hab., contraste Policía vs. Medicina Legal, mapa interactivo y ranking.

---

## Archivos del módulo

| Archivo | Rol | ¿Actualizar manualmente? |
|---------|-----|--------------------------|
| `homicidios.medicinalegal.json` | Datos INMLCF para 32 capitales | **SÍ — cada mes** |
| `poblacion.dane.json` | Proyecciones DANE 2025-2026 | No — fijo hasta 2027 |
| `scripts/fetch-cifras.mjs` | Pipeline SIEDCO → JSON | Solo si cambian IDs de datasets |
| `src/data/cifras.data.json` | Snapshot generado por el pipeline | No — generado automáticamente |
| `fuentes.config.json` | IDs verificados de SIEDCO | Solo si cambian IDs de datasets |
| `src/pages/cifras.astro` | Página del dashboard | No tocar |

---

## Calendario de actualización

| Fecha aprox. | Fuente | Acción |
|-------------|--------|--------|
| Día 16-17 del mes | Policía Nacional (SIEDCO via datos.gov.co) | Re-ejecutar el pipeline |
| Día 20-25 del mes | Medicina Legal (boletín INMLCF) | Actualizar `homicidios.medicinalegal.json`, luego re-ejecutar el pipeline |

Ejecutar el pipeline sin actualizar MedLeg también está bien: solo refrescará los datos de Policía y mantendrá los de MedLeg del mes anterior.

---

## Procedimiento paso a paso

### 1. Actualizar Medicina Legal (cuando salga el boletín mensual)

Medicina Legal publica el boletín de lesiones de causa externa en [medicinalegal.gov.co](https://www.medicinalegal.gov.co). El cuadro relevante es el de homicidios por municipio.

Abrir `homicidios.medicinalegal.json` y actualizar por ciudad los campos que correspondan al nuevo mes:

- `homicidios_2026_ene_abr` → acumulado ene-abr (o el periodo disponible del año actual)
- `variacion_pct_ene_abr` → recalcular: `((2026_ene_abr - 2025_ene_abr) / 2025_ene_abr) × 100`
- `direccion` → `"AUMENTO"` o `"DISMINUCION"` según el signo

Cuando cierre diciembre 2026, agregar `homicidios_2026_completo`.

### 2. Ejecutar el pipeline

```bash
node scripts/fetch-cifras.mjs
```

El script:
1. Descarga datos de Policía desde SIEDCO (datos.gov.co) usando los IDs de `fuentes.config.json`
2. Carga `poblacion.dane.json` y `homicidios.medicinalegal.json`
3. Calcula tasas x100.000 hab., variaciones comparables y discrepancias Policía-MedLeg
4. Escribe `src/data/cifras.data.json` con la nueva fecha de corte

Verificar en el output:
- `38/38 municipios` procesados
- `32/32 discrepancias` calculadas
- Totales nacionales coherentes con los boletines

### 3. Verificar localmente (opcional pero recomendado)

```bash
npm run dev
# Abrir http://localhost:4321/el-gato-lector-1/cifras
```

Revisar:
- La fecha de corte en el hero es correcta
- Los KPIs nacionales coinciden con los boletines oficiales
- El ranking y el mapa se actualizan al cambiar de delito

### 4. Publicar

```bash
# Agregar solo los archivos que cambiaron
GIT_EXEC_PATH=/opt/homebrew/Cellar/git/2.54.0/libexec/git-core git add src/data/cifras.data.json homicidios.medicinalegal.json

GIT_EXEC_PATH=/opt/homebrew/Cellar/git/2.54.0/libexec/git-core git commit -m "chore: actualizar cifras seguridad $(date +%Y-%m)"

GIT_EXEC_PATH=/opt/homebrew/Cellar/git/2.54.0/libexec/git-core git push
```

GitHub Actions reconstruye el sitio automáticamente y lo publica en GitHub Pages.

---

## Si cambian los IDs de SIEDCO

Los IDs verificados el 2026-07-14:

| Dataset | ID |
|---------|----|
| Homicidio | `m8fd-ahd9` |
| Hurto a personas | `4rxi-8m8d` |
| Extorsión | `q2ib-t9am` |

Si un dataset cambia de ID:
1. Buscar el nuevo dataset en [datos.gov.co](https://www.datos.gov.co)
2. Verificar con una consulta de prueba: `https://www.datos.gov.co/resource/{NUEVO_ID}.json?$limit=3`
3. Confirmar que las columnas `cod_muni`, `municipio`, `fecha_hecho`, `cantidad` existen
4. Actualizar `DATASETS` en `scripts/fetch-cifras.mjs` y `fuentes.config.json`

---

## Reglas metodológicas (no modificar)

- **Rankings y mapa siempre por tasa x100k** — nunca por absoluto
- **Población del mismo año que los casos**: casos 2025 → `poblacion_2025`, casos 2026 → `poblacion_2026`
- **Series desde 2019**: no comparar con 2016-2018 (quiebre SIEDCO-SPOA)
- **Ventanas comparables**: ene-abr 2025 vs. ene-abr 2026 (mismos 4 meses), no contra el año completo
- **Base mínima 20 casos**: si `casos_2025_ene_abr < 20`, la variación % se suprime (`base_pequena: true`)
- **Homicidios en capitales**: usar Medicina Legal como fuente primaria (datos forenses); Policía como contraste
- **Sin dato → "sin dato"**: nunca rellenar con ceros ni estimaciones no etiquetadas

---

## Transición a 2027

Cuando llegue enero 2027:
1. Actualizar `poblacion.dane.json` con proyecciones DANE 2027 (descargar del portal DANE)
2. Agregar `homicidios_2026_completo` a cada ciudad en `homicidios.medicinalegal.json`
3. Ajustar el periodo de comparación en `fetch-cifras.mjs` de `ene_abr_2026` a `ene_abr_2027`
4. El pipeline soporta años arbitrarios vía `DESDE_ANIO = 2019` — no requiere cambios en esa constante
