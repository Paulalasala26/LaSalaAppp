# APP R v3 — Fase 2 · Inventario exhaustivo de emisores de Avisos y matriz de autorización

**Fecha:** 04/11/2026 · **Rama revisada:** `test/v1.0` · **Estado:** inventario verificado, permisos de backend **propuestos / pendientes de validación del gestor del Backoffice**. **Sin despliegue ni cambios operativos.**

## Alcance y evidencia

Se inspeccionó íntegramente el `index.html` activo (24.950 líneas), no los ficheros extraídos que fueron revertidos al deshacer el *split*. Se examinaron las 12 funciones bajo `api/` y el lector `lib/admin-avisos-read.js`. En `index.html` hay **10 invocaciones operativas a `notificarUsuario`**, agrupadas en **9 familias de eventos**; un punto emite por separado a **dos** destinatarios, por lo que hay 10 llamadas. Todas confluyen en `notificarUsuario` (1407–1427), que guarda el JSON global `lasala-avisos-usuario-v1` con ETag y después invoca `enviarPushA` (1355–1363), cuyo navegador elige `target/title/body` y llama directamente a Cloudflare Worker. Las 12 APIs Vercel activas **no contienen otro emisor directo** a ese Worker. No se examinó la versión viva del Worker, cuyo acceso sigue pendiente.

### Matriz completa de los eventos efectivamente generados

| ID candidato | Origen del frontend | Actor que debe autorizar el servidor | Destinatario derivado del servidor | Contexto/condición de emisión |
|---|---|---|---|---|
| `riego_hojas_marcadas` | `marcarHojasMarcadas` (1800–1805) | TÉCNICO activo, habilitado en la sala | `VIGUERAS` si sigue ADMIN activo | Solo **Sala 1 o Sala 2**, aviso manual tras confirmar fin de marcado. No hay registro único dedicado de emisión |
| `riego_hojas_corregidas` | `avisarHojasCorregidas` (1810–1818), **2 llamadas** | **Usuario exacto `VIGUERAS` + ADMIN vigente**, no cualquier ADMIN | `FRAN` y `DENNIS`, vigentes y habilitados | Aviso general, dos entregas con **una sola operación deduplicada**; no crear un Push para cada pulsación duplicada |
| `riego_validado_modificado` | `saveRiegoInvPatch` (14260–14299) | Autor de escritura real validada y autorizado para el INV | `VIGUERAS` | Tras guardado confirmado, celdas que estaban marcadas `revisadoPorVigueras`. No confiar en un flag `avisoSupervisor` procedente del cliente |
| `riego_propuesta_creada` | `enviarPropuestaInminente` (19367–19383) | TÉCNICO activo con permiso sobre el INV | `VIGUERAS` | El registro `prop_*` permanece `pendiente` en `lasala-propuestas-riego-v1` y el valor original de riego era `?` |
| `riego_propuesta_aceptada` | `aceptarPropuestaRiego` (19442–19460) | `VIGUERAS` (ADMIN activo) | Autor `propuestoPor` original, no cambiado por el cliente | Se aplicó y guardó riego, se persistió estado `aceptada` |
| `riego_propuesta_aceptada_cambios` | `cambiarYAceptarPropuestaRiego` (19462–19485) | `VIGUERAS` (ADMIN activo) | `propuestoPor` original | Se cambió texto final, se aplicó y guardó riego y propuesta |
| `riego_propuesta_rechazada` | `rechazarPropuestaRiego` (19487–19504) | `VIGUERAS` (ADMIN activo) | `propuestoPor` original | Propuesta pasa a `rechazada`; el `?` del riego no se cambia |
| `riego_problema_reportado` | `enviarProblemaRiego` (20437–20459) | REGANTE activo, únicamente entradas de **hoy** en sus INV | TÉCNICO de guardia resuelto en backend | Uno o más riegos de agua/abono; destino según hora real del reporte, no horario del riego. Tipo `problema_ejecucion` |
| `riego_problema_resuelto` | `guardarSolucionProblemaRiego` (1751–1774) | TÉCNICO destinatario del aviso original y autorizado | `problemaData.reportadoPor` original | Texto solución obligatorio; opcional reunión en cabezal; el aviso v1 se elimina antes de enviar respuesta, **la nueva API debe hacer transición + outbox atómicos** |

**Evidencias de otras vías, que NO son estas 9 familias:**

- **Tareas nuevas**: `avisarNuevasTareas` (1243–1257) muestra *toast* y opcional `new Notification` cuando se abre la vista (3650–3655), después marca `visto` en `lasala-tareas-v1`. **No llama a `notificarUsuario` ni al Worker**. Los Push al técnico por ejecución de tarea de peón/regante se retiraron expresamente (comentario código 3860–3869). **Prohibido reintroducirlos** mediante la nueva API.
- **Riego Sync**: `publicarEventoRiego` (13538–13561) publica señales de sincronización. **No todas implican aviso al usuario**: solo `cambiosSobreValidado` confirmado activa el aviso `riego_validado_modificado`.
- **Tuta semanal**: Cron autónomo histórico de Cloudflare, no una llamada del frontend. Conserva **jueves 07:00 UTC**, dos destinatarios (`FRAN`, `DENNIS`), y no debe duplicarse durante una migración.
- **Campana / Backoffice / evaluación**: leen o modifican estado de avisos, no generan eventos salvo la **respuesta a problema resuelto** descrita arriba. La campana muestra solo no leídos a ADMIN/TÉCNICO; Backoffice es de lectura administrativa.

## Permisos y ámbito por sala/invernadero

Estos son los límites derivados del código vigente, **no permisos acordados para producción**:

| Actor | Ámbito operativo observable | Validación obligatoria en servidor |
|---|---|---|
| `REGANTE1` (REGANTE) | Sala 1 | Resolver INV mediante catálogo del backend y exigir Sala 1 |
| `REGANTE2` (REGANTE) | Sala 2 | Resolver INV y exigir Sala 2 |
| `REGANTE3` (REGANTE) | Salas 3, 4 y 5 | Resolver INV y exigir una de esas tres salas |
| TÉCNICO | En frontend aparecen invernaderos de las cinco salas | Comprobar **rol vigente** y ámbito concreto autorizado por el gestor. No inventar lista de invernaderos individuales sin fuente |
| `VIGUERAS` (ADMIN) | Supervisor y receptor de propuestas/cambios | Exigir **UID/nombre de usuario exacto** y rol activo; el rol ADMIN de `PAULA` no implica ser supervisor de estas comunicaciones |
| PEÓN | Solo los avisos locales de sus nuevas tareas, según asignación | No dar emisión arbitraria al supervisor o técnicos |
| CARGADOR | Sin emisor de estos eventos en `index.html` | No conceder emisión de Riego/Propuestas por ser autenticado |
| Otros ADMIN | Consultas autorizadas de Backoffice | No conceder automáticamente capacidad de pulsar acciones privativas de `VIGUERAS` |

Fuente: `USER_ROLES` de `index.html:729` (puede actualizarse desde `lasala-roles-v1`), `salaDeInv` / `reganteDelaSala` (15915–15931); asignaciones regantes repetidas en 19792, 19812 y 20394–20396. El frontend contiene un **fallback a Sala 1 ante usuario REGANTE desconocido**: `|| ['sala1']`. **No reproducir ese fallback en el servidor**: un usuario/regante sin asignación validada debe ser rechazado.

### Guardias y hora local

El destinatario de un problema no depende de un `target` recibido por HTTP. `tecnicoDeGuardia` (17274–17291) alterna entre `FRAN` y `DENNIS` cada semana, referida al **lunes 27/07/2026** (FRAN mañana, DENNIS tarde), con cambio a las **14:00 hora local** (17213–17319). Sábados y domingos corresponde al técnico de tarde de esa semana, todo el día. **La API debe recomputarlo con reloj de servidor en zona `Europe/Madrid`**, comprobando las cuentas activas; no confiar en la hora del dispositivo ni en un ID de técnico enviado por el solicitante. Las sustituciones excepcionales/turnos manuales **requieren decisión del gestor**, no inferir que el algoritmo antiguo es siempre la planificación real.

### Restricciones de seguridad transversal

1. **No aceptar `target`, `titulo`, `mensaje`, `reportadoPor`, `propuestoPor`, `rol`, `uid`, `sala` ni `guardia` libres como autoridad.** La ruta recibe `tipoEvento + referencia` y, si hay contenido editable (propuesta, solución), se valida y guarda mediante una acción de negocio concreta con identidad y alcance. El destinatario deriva del registro persistido y versión aprobada.
2. **No anunciar Push sin persistencia confirmada**: `notificarUsuario` actual ignora errores de escritura y llama a Push después igualmente (1416–1426). El backend nuevo debe guardar evento/outbox con CAS o reserva única y entregar desde esa cola; nunca disparar el Push sobre una escritura fallida.
3. **No confundir vistas con autorización**: `mostrarModuloAvisos` filtra por rol y `currentUser`, pero las funciones de envío están definidas en el navegador. La verificación real debe hacerse en backend leyendo `lasala-users-v1`/`lasala-roles-v1` y las asignaciones/autorizaciones reales.
4. **No perder transiciones**: la evaluación Bien/Mal elimina el aviso y la resolución de problemas también; el nuevo modelo conserva un registro de auditoría inmutable/retención acordada para no perder trazabilidad. El gestor decide conservación definitiva y vista de Backoffice.
5. **No duplicar eventos** en reintentos/offline/clic doble: clave única por evento de negocio + revisión/acción, no solo por texto. Las hojas marcadas/corregidas hoy carecen de una entidad de aviso de origen; el servidor deberá crear un evento de comunicación controlado antes del Push.
6. **No duplicar Tuta**: Cloudflare y Vercel no deben programar simultáneamente el mismo recordatorio; el prototipo actual solo encola y no envía.
7. **No escribir ni crear datos v2** hasta publicar con autorización las denegaciones explícitas de sus raíces. La regla activa `$other` sigue abierta para usuarios autorizados y v1 continúa compartido.

## Trabajo que queda por aprobar antes de implementar

**Gestor Backoffice:** decidir si todos los TÉCNICOS pueden emitir propuestas sobre cualquier invernadero o si existen restricciones individuales, si `VIGUERAS` continúa siendo el único supervisor de riego, cómo gestionar suplencias de guardia, si el marcado de hojas seguirá limitado a Salas 1 y 2 y cómo conservar avisos resueltos/evaluados en Backoffice.

**Ingeniería:** incluir 9 tipos en el servicio de eventos (el prototipo `docs/firebase/prototype-avisos-push-v2.cjs` todavía solo conoce **3 eventos simplificados** y NO está preparado para sustituir el flujo real), asociar referencias persistidas a cada caso, integrar autorizaciones por INV y CAS, publicar reglas privadas v2 autorizadas antes de datos, migrar v1→v2 con conciliación, y validar Push, campana, guardias, offline, rol, Backoffice y reversión. Requiere igualmente cerrar versión activa de Cloudflare y consolidación Cron para liberar slot Vercel.

## Control automatizado de completitud

- `docs/firebase/avisos-event-catalog-v2.json`: catálogo de los 9 eventos y sus emisores, 10 llamadas.
- `docs/firebase/avisos-event-catalog-v2.test.cjs`: scanner de todo `index.html`, cruza invocaciones y origen de función con el catálogo; falla si aparece un emisor nuevo, si cambia el número de llamadas, si Push aparece por otra vía o si Tareas recupera el envío. Se ejecuta en CI sin tocar datos.

**Alcance de esta entrega:** inventario y propuesta de seguridad, no implementación ni aprobación funcional. **No tocar** `api/`, `lib/`, `index.html`, reglas activas, Push Worker, `vercel.json`, Firebase, datos TEST/DEV/PRD ni `main`.
