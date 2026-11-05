# Backoffice — Informes y salida imprimible (04/11/2026)

**Estado actualizado (04/11/2026):** backend + interfaz administrativa implementados en rama aislada `feat/backoffice-informes-export-20261104`. GitHub Actions [ejecución 41873736248](https://github.com/Paulalasala26/LaSalaAppp/actions/runs/41873736248) validó 27/27 pruebas antes de añadir aserciones adicionales de cabeceras. La nueva ejecución queda por confirmar. La comprobación Vercel de esta rama figura en fallo por límite de compilaciones (enlace de plataforma `upgradeToPro=build-rate-limit`), no se ha logrado verificar un despliegue READY. **No fusionado ni desplegado en TEST/PRD.** La aceptación funcional corresponde al gestor del Backoffice.

## Alcance implementado

Se añade **un modo** a la función serverless ya existente, sin aumentar el número de APIs:

`GET /api/admin-qc-dashboard?modo=informes&seccion=<seccion>&formato=<csv|html>`

Requiere cabecera `Authorization: Bearer <Firebase ID token>`, usuario activo y rol **ADMIN** validados por el mecanismo compartido de la API. GET exclusivo, POST/PUT/PATCH/DELETE 405. Solo lectura, sin llamadas de escritura ni modificación de estados, sin nuevos nodos Firebase, sin cambios de reglas o migraciones.

| seccion | Origen reutilizado | Matices |
|---|---|---|
| `qc` | Medición guardada + controles QC | Porcentaje global exacto y enfermedades existentes; sin scoring, medias ni alertas |
| `partidas` | Registros Túnel/Carga | Resumen de controles por partida; **no** stock ni ubicación actual |
| `riego` | Registro por invernadero de Riego v2 | Fecha, calle, texto y autor registrado; no acredita ejecución |
| `plaguicidas` | Consulta administrativa Fito v2 | Celdas registradas, sin certificar ejecución ni consumos |
| `especificos` | Consulta administrativa Específicos v2 | Celdas registradas y vínculos, sin certificar ejecución |
| `tareas` | Consulta Operativas/Archivo | Sin Mantenimiento, firmas ni datos internos |
| `avisos` | Avisos actualmente retenidos | No constituye histórico completo (hasta 30 por destinatario) |
| `mantenimiento` | Tickets y eventos existentes | No ejecuta recurrencias ni expone firmas |

Los filtros que acepta cada sección **son exactamente los ya admitidos por la consulta original**. QC/Partidas requieren `from`/`to` ISO, admiten `tipo=todos|tunel|carga` y `partida`, máximo 91 días. Riego requiere `inv` y fechas, con máximo 91 días. Plaguicidas y Específicos requieren `inv` y fechas según sus validadores. Tareas, Avisos y Mantenimiento mantienen sus filtros originales.

### Formatos

- `formato=csv`: descarga UTF-8 con BOM, columnas fijas y datos acotados; escapa comillas, controles y entradas con prefijos de fórmula para evitar ejecución accidental al abrir el archivo en Excel.
- `formato=html`: página estática imprimible (A4 horizontal), todos los campos escapados, CSP sin scripts ni recursos externos. El usuario elige **Imprimir** o **Guardar como PDF** en el navegador.
- Ambos indican registros mostrados y totales filtrados. **Si el origen devuelve solo N de M registros por límite, se informa expresamente de que el informe es parcial**; no se presentan los archivos truncados como exportaciones completas.
- No se crean medias ni puntuaciones; no se reconstruyen datos de negocio.
- Se conservan `Cache-Control: no-store`, `nosniff`, auth administrativa y respuestas de error de la API existente.

### Ejemplos (requieren token ADMIN)

```text
/api/admin-qc-dashboard?modo=informes&seccion=tareas&formato=csv&vista=operativas
/api/admin-qc-dashboard?modo=informes&seccion=avisos&formato=html&estado=sin_leer
/api/admin-qc-dashboard?modo=informes&seccion=qc&formato=csv&from=2026-11-01&to=2026-11-04&tipo=carga
/api/admin-qc-dashboard?modo=informes&seccion=partidas&formato=html&from=2026-11-01&to=2026-11-04
```

### Integración de la navegación administrativa (rama aislada)

- Nueva página `admin/informes.html` y cliente `admin/informes.js`: acceso autenticado con la misma sesión Firebase, comprobación de ADMIN existente, filtros condicionales para las ocho secciones y preparación explícita de CSV o impresión/PDF.
- Se incorpora la opción «Informes» al menú de las 16 páginas de Backoffice existentes; la nueva pantalla ocupa el destino 17, con selección activa solo en esta página.
- El navegador descarga exclusivamente mediante `fetch` autenticado a `/api/admin-qc-dashboard?modo=informes`, sin lectura directa de Firebase. Se genera una URL temporal del resultado y se libera al cambiar filtros o salir; no se persisten datos del informe.
- `X-Report-Partial`, `X-Report-Shown` y `X-Report-Total` permiten avisar en pantalla cuando una consulta está limitada. La página no promete exportación completa ante truncamiento.
- No se modifica `index.html`, la navegación operativa ni los módulos que están siendo probados por usuarios.

### Protección de los trabajos paralelos

- No modifica `index.html`, `admin/`, flujos operativos, colas offline, datos ni reglas RTDB, Push, Cloudflare, `main`, DEV ni PRD.
- No duplica la auditoría de Firebase ni las más de 2700 pruebas funcionales de frontend.
- El nuevo modo no cambia las respuestas JSON de las consultas administrativas existentes.
- El menú **Informes** ya está preparado en la rama aislada. La validación con datos reales sigue pendiente del gestor y no se ha desplegado.
- Las salidas usan los límites existentes: 150 registros QC, 200 partidas, 400 registros de riego, 250 tareas, 300 avisos y mantenimiento, 400 celdas Fito/Específicos, según cada consulta. Los totales mostrados indican truncamiento.

**Pruebas incluidas:** `node --test lib/admin-informes-export.test.cjs lib/admin-informes-api.test.cjs lib/admin-informes-ui.test.cjs` (fixtures, API con auth/RTDB simulados, escape de CSV/HTML, 401/403/405, cabeceras de resultado, compatibilidad JSON, enlaces consistentes en 17 páginas y filtros). Workflow propio `backoffice-informes-export.yml`, sin secretos, Firebase ni despliegues. Las 27 pruebas anteriores resultaron correctas en CI. Repetir con el último commit antes de integrar. **No fusionar mientras la versión TEST no pueda mantener el despliegue READY y el gestor no haya validado.**

### Ampliación — Informe de registros de Riego

- `lib/admin-riego-read.js`: consulta SOLO `lasala-riego-v2-index` y el shard `lasala-riego-v2-<INV>` solicitado, utilizando token de servicio del endpoint ADMIN; respeta formato JSON serializado y el legado de celdas `string`/`{texto,marcadoPor}`. Valida índice, duplicados, fechas e invernadero, con límite de 91 días y 400 filas de salida, total filtrado visible.
- Se añade `seccion=riego` a los formatos CSV/HTML y al selector administrativo. No se presume ejecución de riego ni se realizan escrituras, recálculos, importaciones o cambios en riego operativo.
- Suite `lib/admin-riego-read.test.cjs` con datos sintéticos, protección de índice, tratamiento de celdas inválidas, fechas y truncamiento. Se añade a CI del PR.
- La versión TEST continúa sin fusionar; la prueba de aceptación sigue asignada al gestor del Backoffice.
