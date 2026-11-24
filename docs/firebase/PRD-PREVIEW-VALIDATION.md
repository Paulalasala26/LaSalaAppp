# Validación de Preview PRD — 2026-11-24

**Despliegue:** `https://la-sala-app-qyvhqrcby-mruizfue-3539.vercel.app/`  
**Entorno:** Preview de PRD, mismo proyecto Firebase con datos operativos aislados bajo `/prd`.  
**Alcance:** validación manual de circuitos con ejemplos temporales, sin ejecutar ni sincronizar el conector GS.

## Resultados

| Circuito | Resultado | Evidencia / observación |
|---|---|---|
| Acceso a la app | OK | La Preview abrió ViguerAPP y permitió acceder al menú autenticado. |
| Control de Calidad | Bloqueado | La semana 24–30 nov muestra 0 partidas y 0 inspecciones. La búsqueda de `PRDVAL20261124` devuelve “No se ha encontrado ninguna línea con esa partida”. No se creó un QC ni se cargó ninguna foto. Para guardar un control se necesita una partida disponible en PRD; no se ejecutó GS ni se inventó/importó una partida. |
| Control de Riego | Fallido | Al seleccionar invernadero `0A`, la app muestra: “No se han podido cargar los datos — revisa tu conexión. Lo que ves puede estar incompleto”. Se reintentó y volvió a ocurrir. No se guardó ningún riego. |
| Tareas | Creación OK; limpieza incompleta | Se creó `VALIDACION PRD TEMP - NO EJECUTAR`, asignada a `REGANTE1`, con descripción que indica no realizar trabajo real. Al anularla, la app la movió al Archivo (contador Archivo = 1); la interfaz indica que se conserva y no ofrece borrado desde esa vista. La tarea sigue como registro archivado en PRD y necesita una decisión sobre su eliminación definitiva. |
| Borrador/offline y sincronización manual | No probado | No se pudo generar un borrador QC al no haber partidas disponibles. No se ejecutó GS ni se pulsó ningún flujo de sincronización GS. |

## Conclusión

La Preview y la autenticación están operativas. La creación de tareas escribe en PRD; el QC no puede verificarse sin una partida de prueba disponible; Riego tiene un error de carga que requiere diagnóstico antes de guardar. La validación no queda aprobada para uso operativo hasta repetir QC, Riego y offline con los bloqueos resueltos.

## Limpieza pendiente

La tarea temporal está anulada y archivada, pero no eliminada. La UI advierte explícitamente que anular conserva el registro. No se ha intentado borrado definitivo por otra vía.
