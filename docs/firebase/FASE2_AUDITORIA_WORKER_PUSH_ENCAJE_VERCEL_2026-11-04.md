# APP R v3 — Fase 2: auditoría Cloudflare Push, funciones Vercel y plan de retirada

**Fecha:** 04/11/2026 · **Estado:** auditoría y arquitectura, sin cambios operativos · **Rama:** `test/v1.0`.

## 1. Evidencia obtenida

**Repositorio Vercel TEST:** inventario directo GitHub API `contents/api?ref=test/v1.0`: exactamente **12 archivos JavaScript que Vercel publica como funciones**:

1. `admin-audit-prune.js`
2. `admin-audit.js`
3. `admin-catalog.js`
4. `admin-qc-dashboard.js`
5. `admin-qc-mediciones.js`
6. `admin-qc-reglas.js`
7. `admin-qc-sharepoint.js`
8. `admin-riego-options.js`
9. `admin-users.js`
10. `firebase-auth.js`
11. `qc-fotos-galeria.js`
12. `qc-fotos-sharepoint.js`

`vercel.json` contiene un cron diario **`0 4 * * *`** sobre `/api/admin-audit-prune`. La función `admin-audit-prune.js` comprueba **`CRON_SECRET`** mediante comparación constante y llama a `pruneExpiredAudit`, que ya está exportada desde `api/admin-audit.js`.

Vercel documenta que, para proyectos Hobby **sin framework que agrupe funciones**, cada archivo `api/` cuenta como función y el máximo es **12 por despliegue**: https://vercel.com/docs/functions/runtimes . **No se ha verificado el plan comercial de esta cuenta**, por tanto 12 es el límite de diseño conservador, no una afirmación sobre suscripción actual.

**Copia histórica del Worker** localizada en SharePoint/OneDrive corporativo, backup `La Sala / 80 - APP riego / 10 - Backup / 10 - 210926 / Paula / cloudflare-push / src/index.js` (fichero fechado en agosto de 2026), junto con `wrangler.toml`. El endpoint invocado hoy por el **código del frontend TEST** es `https://lasala-send-push.lasala-send-push.workers.dev` (index.html línea aproximada 1354). En la copia, `wrangler.toml` tiene `name=lasala-send-push` y `crons=["0 7 * * 4"]`.

**IMPORTANTE: backup antiguo, NO versión desplegada confirmada**. Sin credenciales/lectura de versiones de cuenta Cloudflare no se puede demostrar si estos hallazgos siguen activos. No se ha enviado POST ni GET a datos reales, ni push de prueba; no publicar el código privado, valores secretos o suscripciones.

## 2. Resultados de auditoría del backup del Worker

| Hallazgo comprobado en copia | Evidencia de líneas | Severidad potencial |
|---|---|---|
| Endpoint `POST` sin validar identidad, firma, secret, rol ni origen confiable; usa directamente `target,title,body` suministrados por quien llama | Worker ~57–76 | **Crítica**, si el despliegue actual se corresponde con el backup |
| `Access-Control-Allow-Origin: *` y cabeceras `Content-Type` únicamente; no son una barrera de autenticación | ~12–16 | Alta, facilita llamadas desde navegadores de cualquier origen |
| Acceso Firebase mediante REST sin `auth` ni `Authorization`; apunta a `la-sala-app-default-rtdb` (PRD), distinto de `la-sala-app-test-default-rtdb` del frontend TEST | ~9, 22–31, 79–83, 125–129 | **Crítica** si las reglas de PRD permiten leer/escribir y el código sigue desplegado; en caso contrario puede fallar la función |
| Limpieza de suscripciones HTTP 404/410 mediante **GET/PUT del JSON global** sin `if-match` ni relectura bajo conflicto | ~117–129 | Alta: posible pérdida de suscripciones concurrentes |
| Sin controles locales visibles de límite por destinatario, cuerpo, frecuencia o cuota de envío | ~65–72, ~90–115 | Alta: spam, abuso de proveedor y costes |
| Cron propio semanal jueves a las **07:00 UTC** manda recordatorio Tuta a dos destinatarios fijos, sin consultar roles vigentes | ~46–55; `wrangler.toml` | Riesgo funcional: **conservarlo** en migración; en España equivale a 08:00 invierno/09:00 verano |
| El frontend llama Worker directamente con `{target,title,body}`, sin `Authorization` | index.html ~1351–1363 | Exposición del contrato de envío y falta de control por evento |

La copia usa `env.VAPID_PRIVATE_KEY` en Cloudflare, no una clave privada hardcodeada; esto es positivo. La URL Firebase no constituye por sí sola prueba de lectura/escritura exitosa. **CORS abierto no es por sí mismo la vulnerabilidad**, pero no mitiga la ausencia de autorización.

## 3. Riesgo inmediato y tratamiento condicionado a estado activo

**Prioridad de seguridad:** verificar versión implementada del Worker en Cloudflare (código y configuración, nunca secretos en claro). Si reproduce el backup: bloquear las llamadas no autenticadas a `POST` antes de aceptar nuevos destinatarios; preparar una ruta temporal de entrega autenticada o asumir una interrupción controlada de Push mientras se migra. No probar enviando mensajes arbitrarios a usuarios reales. El endpoint de calendario `scheduled()` no debe confundirse con HTTP público.

La prueba debe confirmar desde entorno aislado: sin credenciales `POST→401/403` sin envíos, solicitud firmada válida `→` entrega de prueba autorizada y única, identidad de destinatario controlada por servidor, y no acceso sin credenciales a la base PRD.

## 4. Recomendación técnica: consolidar Vercel y retirar Worker, por fases

**Recomendación principal:** evitar conservar dos servicios de envío y dependencias anónimas a Firebase. Ejecutar la entrega Push desde una función **Vercel Node**, que puede usar `web-push`, verificar Firebase Auth y cuenta/rol real, firmar suscripciones y acceder a RTDB con credenciales de servicio.

**Capacidad de funciones:**

| Estado | Archivos de API |
|---|---:|
| Actual TEST | 12 |
| Integrar poda Cron en la función existente `api/admin-audit.js` y retirar `api/admin-audit-prune.js` tras pruebas | 11 |
| Añadir una única `api/avisos-push.js` para todas las operaciones Avisos + Push | **12** |

### Consolidación segura de auditoría/Cron (PROPUESTA NO EJECUTADA)

- Actualmente `api/admin-audit-prune.js` es un wrapper de ~1,4 KB que llama a una función ya exportada de `api/admin-audit.js`; es el candidato menos invasivo para liberar una ruta.
- Ampliar `/api/admin-audit` con rama explícita de solicitud interna `?job=prune`. **Validar método GET, `CRON_SECRET` configurado (≥16), `Authorization: Bearer <CRON_SECRET>` con comparación en tiempo constante, y nunca permitir entrar por la rama de lectura administrativa con ese token**.
- Mantener intacta la ruta normal de auditoría para ADMIN con Firebase ID token. Probar que CRON_SECRET no concede lectura de auditoría y que ID token ADMIN no permite activar la poda.
- Modificar `vercel.json` (únicamente tras validación) para apuntar al nuevo destino del cron. Rechazar despliegue si el cron no funciona o se repite; conservar el backup y comprobar ejecuciones previas.
- Después de UAT/ensayo horario y logs, eliminar la función wrapper anterior para liberar el slot. **No borrar el cron sin alternativa efectiva**.

### Una API de Avisos/Push (PROPUESTA NO EJECUTADA)

- `api/avisos-push.js` contiene un dispatcher con rutas de acción de lista cerrada: `mine`, `send-event`, `mark-read`, `dismiss`, `evaluate`, `resolve`, `push-register`, `push-unregister`, `admin-list` y `weekly-reminder`. La lógica pesada se ubica en `lib/`, no en ficheros adicionales dentro de `api/`.
- Para toda acción de usuario, verificar JWT Firebase ID y UID derivado del usuario real, consultar `lasala-roles-v1` y `lasala-users-v1` con token de servicio, validar permisos por objeto/evento y **no confiar en `target/title/body` enviado por cliente**.
- Avisos y suscripciones en `lasala-avisos-v2/<uid>/...` y `lasala-push-subs-v2/<uid>/...`, **cliente RTDB bloqueado**; servidor aplica CAS/ETag, deduplicación, límites, idempotencia, revocación en logout y control de sesión compartida.
- Enviar Web Push desde Vercel con suscripciones de identidad validada. Las claves VAPID se mantienen como **secretos de entorno** (no versionar); no se copian valores secretos del Worker a GitHub.
- Preservar el recordatorio semanal del jueves migrándolo a un Cron Vercel que invoque la misma API mediante rama `weekly-reminder` autenticada con `CRON_SECRET`; confirmar horario peninsular y cambios DST, no asumir que 07 UTC siempre es 09:00 España.
- Mantener la vista Backoffice Avisos de solo lectura y la semántica existente de `visto/leido/evaluado/resuelto`, campana y límite de 30.
- Desplegar primero API+almacén v2, adaptar el frontend TEST, reconciliar los mensajes/suscripciones entre v1/v2, verificar dispositivos y cron, **solo entonces desactivar Worker**. Mientras coexistieran dos canales, evitar dobles envíos por idempotencia. Cortar el acceso directo a v1 cuando los clientes antiguos hayan sido retirados.

**Alternativa:** conservar Worker con verificación HMAC de petición de Vercel (`timestamp + nonce + digest de cuerpo`), secreto Cloudflare, protección anti replay y lista de destinatarios resuelta en servidor, nunca cliente directo. Requiere acceso y mantenimiento de dos plataformas; menos recomendable si cabe el envío en Vercel. Referencia oficial: https://developers.cloudflare.com/workers/examples/signing-requests/ y https://developers.cloudflare.com/workers/configuration/secrets/.

## 5. Pruebas y puertas

1. Cargar **la versión desplegada** de Worker desde Cloudflare; comparar con backup; sin lectura no afirmar falla actual.
2. Probar la consolidación Cron en emulador y con llamadas simuladas: GET sin secret→401/503, secret erróneo→401, secret verdadero→poda solo de registros caducados, ID token ADMIN sin secret→401 en rama Cron, GET auditoría normal exige ADMIN.
3. Revisar el build en preview (11→12 funciones) y las dos programaciones Cron (diaria auditoría y jueves Tuta), sin tocar PRD.
4. Ensayar registros multi-dispositivo, cambio de usuario en navegador compartido, concurrencia ETag, entrega única, expiración 404/410 y recuperación tras caída del proveedor Push.
5. UAT por gestor del Backoffice y autorización expresa previa a migración de datos y reglas activas.

## 6. Actualización del estado de Fase 1 — emulador VERIFICADO

**Se resolvió la limitación previa de lectura de Github Actions mediante `mcp__GitHub__fetch` en la colección `/actions/runs`.**

**Último run verificado:** [41805053676](https://github.com/Paulalasala26/LaSalaAppp/actions/runs/41805053676), rama `test/v1.0`, commit `33c778c9290b6703a9a5c16f0d88a1004b5a6573`, evento `push`, 04/11/2026, resultado `success`. Se examinaron los pasos y logs del job `test`:
- Matriz estática de permisos: **PASS**.
- Contrato de credenciales de API: **PASS**.
- Regresión aislada de API sobre mocks: **PASS**.
- Emulador oficial RTDB `demo-lasala-phase1`, configurado solo loopback: **13 tests, 13 PASS, 0 FAIL**.
- El emulador produjo `permission_denied` esperados para perfiles sin permiso; son precisamente los resultados negativos que comprueba la suite, no fallos.
- **No hubo publicación de reglas activas, ni contacto con las bases operativas.**

Esto valida la matriz **candidata de Fase 1** pero no acredita regresión real en TEST, el código Cloudflare actualmente desplegado ni seguridad de los demás nodos (`$other` sigue abierto). **NO constituye autorización para desplegar reglas**.

## 7. Resumen de cambios y límites

Solo se han creado y actualizado documentos de auditoría en la rama `test/v1.0`. **NO** se modificó `index.html`, `api/`, `vercel.json`, `database.rules.test.json`, datos, reglas activas, Cron, Worker, `main`/PRD o DEV. No se han ejecutado mensajes Push ni sondas que escriban en producción.

**Siguiente bloque técnico recomendado:** crear prototipo unitario y pruebas de la consolidación `admin-audit`/Cron y del dispatcher Avisos-Push en `docs/firebase/` (solo archivos de ensayo), con código de producción inalterado, antes de plantear cambios funcionales.
