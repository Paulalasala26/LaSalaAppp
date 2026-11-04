# Backoffice — Informes y salida imprimible (04/11/2026)

**Estado:** implementación aislada en `feat/backoffice-informes-export-20261104`, originada desde `test/v1.0`. No se ha unido ni desplegado a TEST/PRD. La validación funcional corresponde al gestor del Backoffice.

## Alcance implementado

Se añade **un modo** a la función serverless ya existente, sin aumentar el número de APIs:

`GET /api/admin-qc-dashboard?modo=informes&seccion=<seccion>&formato=<csv|html>`

Requiere cabecera `Authorization: Bearer <Firebase ID token>`, usuario activo y rol **ADMIN** validados por el mecanismo compartido de la API. GET exclusivo, POST/PUT/PATCH/DELETE 405. Solo lectura, sin llamadas de escritura ni modificación de estados, sin nuevos nodos Firebase, sin cambios de reglas o migraciones.

| seccion | Origen reutilizado | Matices |
|---|---|---|
| `qc` | Medición guardada + controles QC | Porcentaje global exacto y enfermedades existentes; sin scoring, medias ni alertas |
| `partidas` | Registros Túnel/Carga | Resumen de controles por partida; **no** stock ni ubicación actual |
| `plaguicidas` | Consulta administrativa Fito v2 | Celdas registradas, sin certificar ejecución ni consumos |
| `especificos` | Consulta administrativa Específicos v2 | Celdas registradas y vínculos, sin certificar ejecución |
| `tareas` | Consulta Operativas/Archivo | Sin Mantenimiento, firmas ni datos internos |
| `avisos` | Avisos actualmente retenidos | No constituye histórico completo (hasta 30 por destinatario) |
| `mantenimiento` | Tickets y eventos existentes | No ejecuta recurrencias ni expone firmas |

Los filtros que acepta cada sección **son exactamente los ya admitidos por la consulta original**. QC/Partidas requieren `from`/`to` ISO, admiten `tipo=todos|tunel|carga` y `partida`, máximo 91 días. Plaguicidas y Específicos requieren `inv` y fechas según sus validadores. Tareas, Avisos y Mantenimiento mantienen sus filtros originales.

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

### Protección de los trabajos paralelos

- No modifica `index.html`, `admin/`, flujos operativos, colas offline, datos ni reglas RTDB, Push, Cloudflare, `main`, DEV ni PRD.
- No duplica la auditoría de Firebase ni las más de 2700 pruebas funcionales de frontend.
- El nuevo modo no cambia las respuestas JSON de las consultas administrativas existentes.
- La incorporación de botones o menú **Informes** en Backoffice y su validación con datos reales quedan fuera de este primer cambio de **backend**.
- Las salidas usan los límites existentes: 150 registros QC, 200 partidas, 250 tareas, 300 avisos y mantenimiento, 400 celdas Fito/Específicos, según cada consulta. Los totales mostrados indican truncamiento.

**Pruebas incluidas:** `node --test lib/admin-informes-export.test.cjs lib/admin-informes-api.test.cjs` (fixtures, API con auth/RTDB simulados, escape de CSV/HTML, 401/403/405, compatibilidad JSON y fuentes QC). Workflow propio `backoffice-informes-export.yml`, sin secretos, Firebase ni despliegues. Pendiente confirmar CI y aceptación del gestor antes de integrar.
