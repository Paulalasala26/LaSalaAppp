# APP R v3 — Fase 2: núcleo integrado de Avisos/Push y reglas privadas v2

**Fecha:** 04/11/2026 · **Rama:** `test/v1.0` · **Estado:** prototipo aislado y pruebas automatizadas; **NINGUNA conexión ni despliegue operativo**.

## 1. Alcance realizado

Se han preparado dos niveles de prototipo **fuera de `api/`**:

1. `docs/firebase/prototype-avisos-push-v2.cjs`: funciones puras de permisos, identidad, evaluación, endpoint Push y autorización de eventos.
2. `docs/firebase/prototype-avisos-push-api-v2.cjs`: simulación del controlador único con autenticación Firebase inyectada, consulta actual de usuario/rol, operaciones de lectura/mutación, CAS, persistencia de endpoint por hash, cola de eventos deduplicada y Cron semanal. **El segundo fichero no es un handler Vercel instalado**: requiere implementaciones reales de adaptadores seguros y pruebas end-to-end antes de usarse.

Se añadió `docs/firebase/prototype-avisos-push-api-v2.test.cjs`, con **31 pruebas** Node, sobre almacenamiento en memoria, permisos y actores ficticios. Resultado comprobado: [GitHub Actions run 41811367132](https://github.com/Paulalasala26/LaSalaAppp/actions/runs/41811367132), `completed/success`; 31/31 PASS y emulador oficial Fase 1 13/13 PASS.

### Operaciones previstas del endpoint único

**Todas las acciones de usuario irían por POST autenticado**, no por peticiones GET anónimas:

| Acción prototipada | Rol | Garantía/operación |
|---|---|---|
| `mine` | Sesión vigente | Devuelve únicamente avisos del UID derivado del token verificado |
| `admin-list` | ADMIN vigente | Lee avisos de todos los usuarios; falta paginar, filtrar y adaptar el informe del Backoffice |
| `mark-seen`, `mark-read` | Propietario | Actualización CAS de `visto` y `leido`, independientes |
| `dismiss` | Propietario | Elimina lógicamente con versión; no accede a datos ajenos |
| `evaluate`, `resolve` | TÉCNICO destinatario | Conserva evaluación Bien/Mal y respuesta a problemas de riego |
| `push-register` | Propietario, consentimiento explícito | Registro del dispositivo/endpoint por hash, propietario único, CAS |
| `push-status` | Propietario | Solo activa cuando el servidor confirma que ese usuario es titular |
| `push-unregister` | Propietario | Rechaza borrar dispositivos de otra cuenta; operación idempotente |
| `emit-event` | Emisor autorizado sobre evento real | Destino desde registro servidor, no desde cuerpo libre; cola idempotente por tipo+referencia |
| Cron semanal vía GET | Solo Vercel Cron + `CRON_SECRET` | Encola recordatorio Tuta una vez por jueves (no hace envío real) |

El identificador Firebase usado por el prototipo coincide con `api/firebase-auth.js`: `lasala-` + primeros 40 dígitos hex del SHA-256 del usuario normalizado. La verificación de JWT y lectura de `lasala-users-v1`/`lasala-roles-v1` **debe implementarse al conectar la API real**: inyectar `loadAccount` / `loadRole` desde el backend protegido, no confiar en rol o UID enviados por navegador.

El almacén simulado se basa en `compareAndSwapAlert`, `compareAndSwapSubscription`, `enqueueNotification` y `enqueueWeeklyReminder`. **Los adaptadores productivos todavía NO existen**. Requieren ETag real y reservas atómicas de idempotencia; los mocks no sustituyen esas garantías.

### Compatibilidad del frontend TEST (sin tocarlo)

| Función actual en `index.html` | Sustitución propuesta (solo cuando se autorice) |
|---|---|
| Campana `actualizarCampanaAvisos`, listado técnico/ADMIN | `mine`, respetando refresco cada 30 s, foco y cambios `leido` |
| `avisarAvisosPendientes` | `mine` + `mark-seen`; mantener `visto` independiente de `leido` |
| `mostrarNotificacionesAdmin` | `mine` + `dismiss`, previa confirmación de paridad UAT |
| `guardarEvaluacionAviso`, `guardarSolucionProblemaRiego` | `evaluate`, `resolve`, respuesta al reportante sin duplicados |
| `notificarUsuario` (múltiples emisores) | `emit-event` con **evento persistido autorizado** y fuente/destino resueltos desde el servidor; no enviar `target/title/body` desde navegador |
| `activarNotificacionesPush`, `desactivarNotificacionesPush`, `estaPushActivado` | `push-register`, `push-unregister`, `push-status`; confirmar usuario real por dispositivo |
| `lib/admin-avisos-read.js` | Adaptar `admin-list` manteniendo filtros, estados, paginación y vista *solo lectura* |

La implementación actual incluye más eventos que los tres que reconoce el **prototipo** (`riego_problema`, `riego_resuelto`, `riego_propuesta`). **No sustituir `notificarUsuario` hasta tener inventario completo** (hojas, propuestas, respuestas, trabajos y posibles incidencias). El prototipo no envía correos, no dispara notificaciones y no tiene cola offline funcional.

### Recordatorio semanal Tuta

Copia histórica del Cloudflare Worker contrastada: `scheduled()` envía un mensaje a **DENNIS** y **FRAN**, título `🐛 Conteo Tuta`, texto `Hoy es jueves — toca hacer el conteo de Tuta.`; `wrangler.toml` programa `0 7 * * 4` (**jueves 07:00 UTC**). El prototipo conserva esos datos y encola ambos eventos de forma idempotente por fecha UTC, siempre que los destinatarios sean cuentas TÉCNICO activas.

**No modificar ni duplicar el Cron semanal actual** hasta la migración: el Cron del Worker sigue siendo el existente y el del proyecto Vercel `/api/avisos-push` **no existe**. Si se migra, mantener el horario UTC o cambiarlo solo tras decisión funcional. No asumir hora local fija con horario de verano.

## 2. Reglas candidatas de Fase 2 — no desplegadas

**Antes de crear cualquier dato v2, deben existir denegaciones explícitas** en reglas RTDB. Con el `$other` actualmente abierto para usuarios con `appUser`, un nodo nuevo sin regla propia sería accesible por cualquier sesión legítima. **Prohibido crear datos sensibles v2 bajo esa condición.**

Se ha añadido el candidato `docs/firebase/database.rules.test.candidate.phase2-avisos-push.json` que mantiene la Fase 1 y niega al navegador lectura/escritura a:

- `lasala-avisos-v2`
- `lasala-push-subs-v2`
- `lasala-push-endpoints-v2` (registro global canónico de propietario por endpoint)
- `lasala-push-outbox-v2`
- `lasala-push-weekly-v2`
- `lasala-push-nonces-v2`

Son propuestas de nombres y contratos aún sin implementar; las 6 denegaciones están diseñadas para servicio privilegiado exclusivamente.

**Los nodos antiguos `lasala-avisos-usuario-v1` y `lasala-push-subs-v1` continúan abiertos por `$other`** en el candidato, a propósito para no interrumpir el frontend actual. No confundir el candidato con un cierre completo de seguridad.

Se añadieron `docs/firebase/firebase-emulator-avisos-push-v2.test.cjs`, `firebase.emulator.phase2.json`, el script `test:emulator:phase2` y un paso GitHub Actions para probar oficialmente esos seis nodos y los cuatro privados de Fase 1, incluyendo acceso hijo, anónimo y cinco roles, más comprobaciones explícitas de que el legado sigue abierto. Todo contra **`demo-lasala-phase2-alerts`**, host local `127.0.0.1:9000`; sin acceso a Firebase real.

## 3. Secuencia de integración operativa (bloqueada)

1. **Seguridad inmediata:** revisar la versión viva de `lasala-send-push` en Cloudflare; su copia histórica carece de autenticación. No hay acceso actual para certificar el despliegue.
2. **Diseño y aprobación:** completar matriz de eventos, permisos por usuario/rol, resultados de UAT y contratos de SMS/Push/Backoffice; validar en especial dispositivos compartidos, revocación en logout y cola offline.
3. **Consolidar Cron diario de auditoría** en `/api/admin-audit`, con test real, backup, ruta `vercel.json` y control del plan Vercel, liberando un slot de las 12 funciones. Hasta entonces no crear `api/avisos-push.js`.
4. **Publicar primero las denegaciones v2** (tras emulador y autorización). No crear nodos v2 antes de protegerlos.
5. Implementar **adaptadores backend** seguros, flujo de migración v1→v2, CAS reales, idempotencia y entrega Push sin destinatario libre.
6. Desplegar API y frontend TEST en fases, conciliando escrituras concurrentes y validando navegador/SW, QC offline y roles.
7. Migrar y verificar Cron semanal; retirar Worker antiguo sólo cuando el nuevo servicio esté validado y no haya doble envío.
8. Retirar finalmente acceso abierto de v1 y cerrar `$other` tras migrar todas las familias restantes (Tareas, Mantenimiento, Riego, QC, Fito, Partidas, Específicos).

**No se ha ejecutado ninguno de los cambios operativos**: no se han modificado `api/`, `lib/`, `index.html`, `vercel.json`, Worker, Firebase activo, datos, `main`, DEV ni PRD. Sólo `docs/firebase/` y CI en `test/v1.0`.
