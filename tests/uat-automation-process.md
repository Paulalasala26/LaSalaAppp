# Procedimiento de automatización de QC

## Fuente y alcance

- La hoja original **La Sala - APP Riego QC.xlsx** de SharePoint conserva los 2.754 casos UAT y sigue siendo la fuente de requisitos.
- La automatización se identifica siempre por el ID `UAT-####`, nunca por el número de fila.
- Los resultados detallados se escriben en el sidecar CSV de SharePoint y se reflejan en el snapshot CSV de la matriz. El XLSX original no se reescribe.
- En una prueba agrupada, cada ID se registra solo si las aserciones cubren el resultado esperado de ese caso.

## Qué se automatiza

1. **Navegador con fixture**: login, roles visibles, navegación, selector de fecha/quincena, formularios, mensajes, tablas, persistencia y recarga.
2. **Contrato de datos**: validaciones, relaciones, duplicados, concurrencia y errores de guardado, usando respuestas Firebase simuladas.
3. **Integración TEST**: Firebase, SharePoint, fotos o procesos externos solo cuando haya un destino TEST aislado y credenciales seguras.
4. **Manual**: cámara y táctil en dispositivos físicos, red móvil, ergonomía y comprobaciones agrícolas sin un resultado digital objetivo.

Se priorizan casos de prioridad Alta y flujos reutilizados. Un resultado de fixture no se presenta como verificación de TEST ni PRD.

## Aislamiento

- Playwright intercepta Firebase y usa datos `E2E-` en memoria; bloquea cualquier host distinto del Firebase permitido.
- Ninguna prueba de esta suite escribe en Firebase TEST o PRD.
- Las pruebas de borrado operan sobre registros creados por su propio fixture.
- La ejecución completa y el smoke corren en GitHub Actions. No requieren controlar el PC del usuario.
- El smoke reducido ejecuta cinco recorridos críticos; la suite UAT completa se ejecuta en cada actualización del PR.

## Ciclo de cada lote

1. Seleccionar casos pendientes y comprobar si son de navegador, contrato de datos, integración TEST o manuales.
2. Añadir una prueba Playwright con los IDs cubiertos y aserciones sobre el resultado esperado y, cuando aplique, la persistencia.
3. Ejecutar el smoke y la suite completa en GitHub Actions. Resolver fallos inesperados y repetir las pruebas inestables.
4. Exportar los resultados del informe Playwright al CSV de evidencia.
5. Actualizar en SharePoint el sidecar y las filas correspondientes del snapshot QC; leer de nuevo ambos archivos para confirmar filas, estados y enlaces.
6. Mantener pendientes los casos que requieran un entorno, dispositivo o criterio que la fixture no pueda verificar.

## Estados

- `PASA_FIXTURE`: pasó en navegador con Firebase interceptado; no equivale a OK de integración TEST o de prueba manual.
- `FALLA_FIXTURE`: discrepancia del producto reproducida en fixture. Los fallos esperados se mantienen como brechas, aunque GitHub Actions termine verde.
- `INESTABLE`: pasó tras reintento o tuvo resultados distintos entre intentos; no se registra como pasada estable.
- `NO_EJECUTADO`: prueba omitida o no ejecutada.
- `PENDIENTE`: no existe cobertura suficiente o falta el entorno requerido.

## Estado al 10 de noviembre de 2026

- Última suite completa: [GitHub Actions #137](https://github.com/Paulalasala26/LaSalaAppp/actions/runs/42813347637), 323/323 pruebas aprobadas y 722 IDs UAT únicos.
- Último smoke: [GitHub Actions #73](https://github.com/Paulalasala26/LaSalaAppp/actions/runs/42813347459), seis pruebas en 7,4 segundos.
- Sidecar acumulado en SharePoint: 805 IDs, 780 `PASA_FIXTURE` y 25 `FALLA_FIXTURE`.
- Snapshot de la matriz: 805 filas con evidencia fixture; 1.949 siguen pendientes y 13 sin estado.
- La prueba automática confirma funciones de la aplicación sobre datos simulados. No certifica permisos/datos de Firebase TEST/PRD, integraciones reales con SharePoint, cámara nativa ni interacción física.
- Brechas reproducibles UAT-509 y UAT-510 identifican límites pendientes de mezcla; UAT-125 y UAT-508 ya pasan estable en fixture. UAT-1234, UAT-1739 y UAT-2045 también pasan en sus recorridos directos de Tareas, Archivo y Avisos.

## Archivos y evidencia

- Flujo UAT: `.github/workflows/uat-playwright.yml`
- Smoke de recorridos críticos: `.github/workflows/e2e.yml`
- Exportador: `tests/export-uat-results.cjs`
- Informe Playwright: artefacto `uat-playwright-report` de cada ejecución UAT.
- [Sidecar de evidencias QC](https://viveroslasala.sharepoint.com/sites/Tecnologia/_layouts/15/Doc.aspx?sourcedoc=%7B181F6288-E2BC-4FA1-A376-E055CB212BAF%7D&file=LaSala_QC_UAT_evidencia_2026-11-06.csv&action=default&mobileredirect=true)
- [Snapshot de la matriz QC](https://viveroslasala.sharepoint.com/sites/Tecnologia/_layouts/15/Doc.aspx?sourcedoc=%7B7D662016-CFD6-42FD-8905-C2B19364CF82%7D&file=La%20Sala%20-%20APP%20Riego%20QC%20-%20snapshot%20automatizacion%202026-11-10.csv&action=default&mobileredirect=true)
