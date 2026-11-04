# APP R v3 — Fase 2: consolidación de auditoría + Cron (prototipo aislado)

**Fecha:** 04/11/2026 · **Rama:** `test/v1.0` · **Estado:** prototipo y pruebas aprobadas; **no implementado, no desplegado**.

## Resultado de la revisión

El repositorio tiene **12** módulos JavaScript bajo `api/`, entre ellos `api/admin-audit.js` (GET ADMIN y exportación de `pruneExpiredAudit`) y `api/admin-audit-prune.js` (GET Cron con `CRON_SECRET`, registro de métricas y llamada a esa función). El cron vigente en `vercel.json` es:

```json
{"path":"/api/admin-audit-prune","schedule":"0 4 * * *"}
```

La consolidación propuesta mantiene `GET /api/admin-audit` para lectura de auditoría autorizada y permite que el **Cron de Vercel** invoque **la misma ruta `/api/admin-audit`** para podar el histórico. La identificación de ruta Cron se hace mediante cabecera `user-agent: vercel-cron/1.0` (documentada por Vercel). **Esta cabecera es falsificable y no autoriza nada:** la poda requiere además la cabecera `Authorization: Bearer CRON_SECRET` completa y verificada con `crypto.timingSafeEqual`. El Cron no acepta token Firebase ADMIN como sustituto del secreto. La ruta normal conserva **sin cambios** la verificación Firebase y roles del administrador. Se rechazan parámetros `job` y solicitudes Cron con otros parámetros.

**No depender de `?job=prune` en `vercel.json`**: la documentación oficial no garantiza expresamente parámetros de consulta en el campo `crons.path`. Usar la ruta pura publicada.

## Archivos únicamente de prueba creados

- `docs/firebase/prototype-admin-audit-cron-router.cjs`: fábrica de controlador con dependencias inyectadas, sólo para ensayo; no está conectada a una API.
- `docs/firebase/prototype-admin-audit-cron-router.test.cjs`: **23 casos** con simulaciones de ADMIN, Cron, secretos y errores; sin llamadas HTTP ni acceso Firebase.
- `.github/workflows/firebase-security-phase1.yml`: un paso CI nuevo que ejecuta el fichero de pruebas.

## GitHub Actions — ejecución real verificada

**Run:** [41810369773](https://github.com/Paulalasala26/LaSalaAppp/actions/runs/41810369773) · **commit probado:** `1d4e892cc2d62cb9495fbb7adb0e77b15bafce14` · **conclusión:** `completed / success`.

| Suite | Aprobadas | Fallidas |
|---|---:|---:|
| Matriz estática permisos RTDB | 84 | 0 |
| Contrato estático de API | 22 | 0 |
| Regresión ETag sin red | 14 | 0 |
| Prototipo Avisos/Push | 16 | 0 |
| Puerta HMAC del Worker (aislada) | 19 | 0 |
| **Unificación Cron y auditoría (nueva)** | **23** | **0** |
| Emulador oficial RTDB (proyecto demo) | 13 | 0 |

**Alcance:** la regresión del nuevo controlador es **aislada con mocks**: las 23 pruebas se ejecutan en Node.js en el runner de GitHub, pero no equivalen a ejecutar el futuro controlador dentro de Vercel ni a una poda real. El emulador oficial valida el candidato de reglas RTDB, **no el Cron de Vercel**.

## Corte futuro — único conjunto atómico, NO aplicar todavía

1. **Preflight:** confirmar que el proyecto independiente `la-sala-app-test` tiene asociada `test/v1.0` como rama de producción, que sus Cron Jobs están activos, que existe `CRON_SECRET` (sin ver ni copiar el valor), que la programación real es `0 4 * * *` UTC y que el responsable ha aprobado el ensayo sobre el histórico. Vercel **sólo ejecuta cron jobs en producción del proyecto**, no en previews. TEST no implica necesariamente preview: confirmar configuración.
2. **En un solo commit/despliegue controlado**, incorporar la función del prototipo (con imports y dependencias reales, sin duplicar la lectura ADMIN) a `api/admin-audit.js`; cambiar `vercel.json` a `{"path":"/api/admin-audit","schedule":"0 4 * * *"}`; eliminar **después de integrar** `api/admin-audit-prune.js`. El número de módulos API bajaría de 12 a 11. No sustituir las reglas Firebase por el prototipo.
3. **Verificar compatibilidad:** `GET /api/admin-audit` con token ADMIN → 200 y mismo formato; otros roles → 403; sin sesión → 401; `user-agent: vercel-cron/1.0` sin secreto → 401; ADMIN + UA Cron sin secreto → 401; Cron + `CRON_SECRET` → poda autorizada (ensayo solo tras backup y autorización).
4. **Verificar programación:** el siguiente disparo real en el panel de Cron debe invocar `/api/admin-audit` sin redirección; confirmar en logs 200, retención de **un año natural**, lote máximo de 100 y `ETag` antes de DELETE. El cron nunca debe leer ni podar otro nodo.
5. **Rollback:** conservar commit y configuración de cron anterior. Advertencia oficial: **Instant Rollback no restaura automáticamente los cron jobs**; si hay que retroceder, **restablecer además la ruta/programación del Cron en Vercel** para evitar una invocación a una función inexistente. Los DELETE ya efectuados no se revierten con un rollback de código, por lo que se necesita backup y control de retención.

## Límites y dependencias de esta fase

- No hay confirmación de la cuenta/plan Vercel del usuario; **12 es un límite de diseño conservador**, no una afirmación sobre la cuenta.
- Las reglas candidatas Fase 1 siguen sin publicar y la matriz completa de permisos de Fase 2 continúa pendiente.
- El prototipo de Push no puede implementarse hasta cerrar la revisión de la versión **realmente desplegada** del Worker de Cloudflare y definir la migración reversible de suscripciones.
- Pruebas UAT de Backoffice bajo el gestor del Backoffice, como acordado.
- El Cron semanal Tuta de Cloudflare es **independiente** y no se modifica ni se mueve con la consolidación del Cron diario de auditoría.

## Referencias técnicas oficiales consultadas

- https://vercel.com/docs/cron-jobs — Vercel documenta `vercel-cron/1.0` como User-Agent de los Cron.
- https://vercel.com/docs/cron-jobs/quickstart — Crons invocados en despliegues de producción.
- https://vercel.com/docs/cron-jobs/manage-cron-jobs — `CRON_SECRET`, concurrencia, idempotencia y comportamiento de Rollback.

**Cambios operativos efectuados en esta tarea: NINGUNO.** `api/`, `vercel.json`, reglas Firebase, Frontend, datos de TEST, DEV, PRD y `main` permanecen intactos. Sólo prototipos, workflow de pruebas y documentación en `test/v1.0`.
