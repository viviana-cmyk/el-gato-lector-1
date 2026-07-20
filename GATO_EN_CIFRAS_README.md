# Gato en Cifras — Guía de actualización mensual

Dashboard de seguridad ciudadana en Colombia: seis delitos de impacto en 38 municipios, con tasas x100.000 hab., mapa interactivo y ranking. **Fuente única: Policía Nacional (SIEDCO).**

---

## Archivos del módulo

| Archivo | Rol | ¿Actualizar manualmente? |
|---------|-----|--------------------------|
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

---

## Procedimiento paso a paso

### 1. Ejecutar el pipeline

```bash
node scripts/fetch-cifras.mjs
```

El script:
1. Descarga los 6 datasets desde SIEDCO (datos.gov.co) en paralelo
2. Carga `poblacion.dane.json`
3. Calcula tasas x100.000 hab., variaciones ene-abr 2025 vs. ene-abr 2026
4. Escribe `src/data/cifras.data.json` con la nueva fecha de corte

Verificar en el output:
- `38/38 municipios` procesados
- Todos los delitos con 37-38 municipios con dato (automotores puede tener 33/38)
- Totales nacionales coherentes con los boletines de Policía

### 2. Verificar localmente (opcional pero recomendado)

```bash
npm run dev
# Abrir http://localhost:4321/el-gato-lector-1/cifras
```

Revisar:
- La fecha de corte en el hero es correcta
- Los 6 KPIs nacionales se actualizaron
- El mapa y el ranking responden a los 6 pills de delito

### 3. Publicar

```bash
GIT_EXEC_PATH=/opt/homebrew/Cellar/git/2.54.0/libexec/git-core git add src/data/cifras.data.json fuentes.config.json
GIT_EXEC_PATH=/opt/homebrew/Cellar/git/2.54.0/libexec/git-core git commit -m "chore: actualizar cifras seguridad $(date +%Y-%m)"
GIT_EXEC_PATH=/opt/homebrew/Cellar/git/2.54.0/libexec/git-core git push
```

GitHub Actions reconstruye el sitio automáticamente y lo publica en GitHub Pages.

---

## Datasets SIEDCO verificados el 2026-07-14

| Delito | Dataset ID | Notas |
|--------|-----------|-------|
| Homicidio | `m8fd-ahd9` | |
| Hurto a personas | `4rxi-8m8d` | |
| Extorsión | `q2ib-t9am` | |
| Hurto a residencias | `7mn7-vzqp` | |
| Violencia intrafamiliar | `gepp-dxcs` | |
| Hurto automotores | `csb4-y6v2` | Filtro: `tipo_delito='ARTICULO 239. HURTO AUTOMOTORES'` |

Si un dataset cambia de ID:
1. Buscar el nuevo dataset en [datos.gov.co](https://www.datos.gov.co)
2. Verificar que tiene columnas `cod_muni`, `fecha_hecho` (formato ISO), `cantidad`
3. Probar con `date_trunc_ym(fecha_hecho)` en la SODA API
4. Actualizar `DATASETS` en `scripts/fetch-cifras.mjs` y `fuentes.config.json`

---

## Reglas metodológicas (no modificar)

- **Rankings y mapa siempre por tasa x100k** — nunca por absoluto
- **Población del mismo año que los casos**: casos 2025 → `poblacion_2025`, casos 2026 → `poblacion_2026`
- **Series desde 2019**: no comparar con 2016-2018 (quiebre SIEDCO-SPOA)
- **Ventanas comparables**: ene-abr 2025 vs. ene-abr 2026 (mismos 4 meses), no contra el año completo
- **Base mínima 20 casos**: si `casos_2025_ene_abr < 20`, la variación % se suprime (`base_pequena: true`)
- **Sin dato → "sin dato"**: nunca rellenar con ceros ni estimaciones no etiquetadas
- **Fuente única**: Policía Nacional (SIEDCO) para todos los delitos y todos los municipios

---

## Transición a 2027

Cuando llegue enero 2027:
1. Actualizar `poblacion.dane.json` con proyecciones DANE 2027 (descargar del portal DANE)
2. Ajustar el periodo de comparación en `fetch-cifras.mjs` de `ene_abr_2026` a `ene_abr_2027`
3. El pipeline soporta años arbitrarios vía `DESDE_ANIO = 2019` — no requiere cambios en esa constante
