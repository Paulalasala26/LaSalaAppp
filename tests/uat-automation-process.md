# Procedimiento de automatización de QC

## Fuente y registro

- La hoja original de SharePoint conserva los requisitos; los resultados se escriben en el sidecar CSV y en el snapshot CSV. El XLSX original no se modifica.
- Usar el ID `UAT-####`, no el número de fila. Registrar cada caso solo si la comprobación cubre su resultado esperado.
- `PASA_FIXTURE` y `FALLA_FIXTURE` describen el comportamiento con datos simulados; no certifican TEST ni PRD.

## Alcance y ritmo

- Priorizar pruebas sencillas de navegador: abrir un módulo, cambiar quincena/periodo y comprobar que se muestran los datos esperados; navegación, formularios y mensajes visibles.
- Agrupar IDs relacionados en una prueba corta. Para un flujo sencillo basta una comprobación visible del resultado; añadir verificaciones extra solo si aparece un fallo o riesgo concreto.
- Quedan fuera de esta campaña los bloques completos de Offline y Concurrencia, así como los casos que requieren dispositivo físico o integración real. Mantener esas filas pendientes.
- Priorizar flujos comunes y casos simples que puedan ejecutarse con fixture. No invertir tiempo en reproducir escenarios largos o condiciones de laboratorio.

## Ejecución y actualización

1. Elegir un grupo pequeño de casos sencillos y relacionados.
2. Ejecutarlo en Chromium con Firebase interceptado; no usar datos reales de producción.
3. Resolver errores inesperados. Una brecha visible del producto puede quedar registrada como `FALLA_FIXTURE` aunque la acción de CI termine correctamente.
4. Exportar los IDs cubiertos y actualizar el sidecar y las filas correspondientes del snapshot.
5. Leer ambos CSV de nuevo y confirmar estados, enlaces y totales. Dejar pendientes los casos fuera de alcance.

El smoke de CI comprueba recorridos críticos, incluido el cambio de quincena y el aislamiento QC. La suite UAT sirve como regresión; el trabajo nuevo debe mantener comprobaciones breves.

## Estado al 10 de noviembre de 2026

- Última suite completa: [GitHub Actions #161](https://github.com/Paulalasala26/LaSalaAppp/actions/runs/42858249705), 334 pruebas terminadas y 788 IDs UAT únicos.
- Último smoke: [GitHub Actions #97](https://github.com/Paulalasala26/LaSalaAppp/actions/runs/42858249857), recorrido de quincena aprobado.
- SharePoint releído: 864 IDs con evidencia, 797 `PASA_FIXTURE` y 67 `FALLA_FIXTURE`; en la matriz, 1.890 pendientes y 13 sin estado.
- UAT-1746–1752, UAT-1754 y UAT-1757–1758 quedan como brechas de Archivo. UAT-1756, UAT-1759 y UAT-1760 pasan las comprobaciones sencillas de tarjeta y consulta.
- UAT-1031, UAT-1036–1038 pasan la comprobación breve de formulario Específicos; UAT-1033–1035 siguen como brechas de ubicación/alcance. UAT-1232, UAT-1240 y UAT-1268–1297 siguen como brechas de Tareas.
- Firebase estuvo interceptado; la suite no certifica datos TEST/PRD, SharePoint real ni dispositivos físicos.

## Archivos

- Flujo UAT: `.github/workflows/uat-playwright.yml`
- Smoke: `.github/workflows/e2e.yml`
- Exportador: `tests/export-uat-results.cjs`
- [Sidecar QC de SharePoint](https://viveroslasala.sharepoint.com/sites/Tecnologia/_layouts/15/Doc.aspx?sourcedoc=%7B181F6288-E2BC-4FA1-A376-E055CB212BAF%7D&file=LaSala_QC_UAT_evidencia_2026-11-06.csv&action=default&mobileredirect=true)
- [Snapshot de la matriz QC](https://viveroslasala.sharepoint.com/sites/Tecnologia/_layouts/15/Doc.aspx?sourcedoc=%7B7D662016-CFD6-42FD-8905-C2B19364CF82%7D&file=La%20Sala%20-%20APP%20Riego%20QC%20-%20snapshot%20automatizacion%202026-11-10.csv&action=default&mobileredirect=true)
