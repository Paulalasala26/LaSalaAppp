# Procedimiento de automatización de QC

## Fuente y registro

- La hoja original de SharePoint conserva los requisitos; los resultados se escriben en el sidecar CSV y en el snapshot CSV. El XLSX original no se modifica.
- Usar el ID `UAT-####`, no el número de fila. Registrar cada caso solo si la comprobación cubre su resultado esperado.
- `PASA_FIXTURE` y `FALLA_FIXTURE` describen el comportamiento con datos simulados; no certifican TEST ni PRD.

## Alcance y ritmo

- Priorizar pruebas sencillas de navegador: abrir un módulo, cambiar quincena/periodo y comprobar que se muestran los datos esperados; navegación, formularios y mensajes visibles.
- Agrupar IDs relacionados en una prueba corta. En un flujo sencillo basta abrir, realizar la acción indicada (por ejemplo, cambiar de quincena) y comprobar el periodo o contenido visible. No añadir guardado, recarga ni persistencia si el caso no lo pide. Ampliar la comprobación solo ante un fallo o riesgo concreto.
- Quedan fuera de esta campaña los bloques completos de Offline y Concurrencia, así como los casos que requieren dispositivo físico o integración real. Mantener esas filas pendientes.
- Priorizar flujos comunes y casos simples que puedan ejecutarse con fixture. Hacer una pasada somera por los casos de bajo riesgo; reservar análisis y reproducción detallados para fallos, datos sensibles y operaciones destructivas.

## Ejecución y actualización

1. Elegir un grupo pequeño de casos sencillos y relacionados.
2. Ejecutarlo en Chromium con Firebase interceptado; no usar datos reales de producción.
3. Resolver errores inesperados. Una brecha visible del producto puede quedar registrada como `FALLA_FIXTURE` aunque la acción de CI termine correctamente.
4. Exportar los IDs cubiertos y actualizar el sidecar y las filas correspondientes del snapshot.
5. Leer ambos CSV de nuevo y confirmar estados, enlaces y totales. Dejar pendientes los casos fuera de alcance.

El smoke de CI comprueba recorridos críticos, incluido el cambio de quincena y el aislamiento QC. La suite UAT sirve como regresión; el trabajo nuevo debe mantener comprobaciones breves.

## Estado al 10 de noviembre de 2026

- Última suite completa: [GitHub Actions #175](https://github.com/Paulalasala26/LaSalaAppp/actions/runs/42865122126), 337 pruebas terminadas y 795 IDs UAT únicos.
- Último smoke: [GitHub Actions #111](https://github.com/Paulalasala26/LaSalaAppp/actions/runs/42865122453), recorrido de quincena aprobado.
- SharePoint releído y conciliado: sidecar con 878 UAT (`806 PASA_FIXTURE`, `72 FALLA_FIXTURE`); matriz con 806 `PASA_FIXTURE`, 72 `FALLA_FIXTURE`, 1.876 `PENDIENTE` y 13 sin estado.
- UAT-1032 sigue como brecha reproducible: una pulsación en celda ocupada no abre «Editar específico».
- Offline y Concurrencia quedan fuera del alcance de la campaña; sus filas permanecen pendientes. La suite puede ejecutar regresiones ya existentes, pero no se añaden ni se amplían casos de esos bloques.
- Firebase estuvo interceptado; la suite no certifica datos TEST/PRD, SharePoint real ni dispositivos físicos.

## Archivos

- Flujo UAT: `.github/workflows/uat-playwright.yml`
- Smoke: `.github/workflows/e2e.yml`
- Exportador: `tests/export-uat-results.cjs`
- [Sidecar QC de SharePoint](https://viveroslasala.sharepoint.com/sites/Tecnologia/_layouts/15/Doc.aspx?sourcedoc=%7B181F6288-E2BC-4FA1-A376-E055CB212BAF%7D&file=LaSala_QC_UAT_evidencia_2026-11-06.csv&action=default&mobileredirect=true)
- [Snapshot de la matriz QC](https://viveroslasala.sharepoint.com/sites/Tecnologia/_layouts/15/Doc.aspx?sourcedoc=%7B7D662016-CFD6-42FD-8905-C2B19364CF82%7D&file=La%20Sala%20-%20APP%20Riego%20QC%20-%20snapshot%20automatizacion%202026-11-10.csv&action=default&mobileredirect=true)
