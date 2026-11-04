# APP R v3 — Fase 2: verificación del Worker Push histórico y guard de autenticación

**Fecha:** 04/11/2026 · **Rama:** `test/v1.0` · **Estado:** validación aislada, **NO desplegado**.

## 1. Qué se ha podido demostrar

La copia **histórica** del código del Worker (SharePoint, backup de agosto de 2026; ruta privada `La Sala/80 - APP riego/10 - Backup/10 - 210926/Paula/cloudflare-push/src/index.js`) contiene un endpoint `POST` que toma `target/title/body` del cliente sin comprobar identidad, autorización o firma antes de consultar Firebase. También referencia un RTDB de PRD. Se realizó una simulación **completamente local** en Node 22, reemplazando `web-push` y `fetch` por dobles aislados, sin red y sin suscriptores reales.

**Resultado real de esa simulación:** una petición `POST` con datos ficticios y **sin credenciales** devolvió HTTP **200** (`sent:0`, sin suscripciones) e intentó efectuar una lectura HTTP GET a Firebase (interceptada). Esto **confirma que el código histórico carece de barrera de autenticación** antes de procesar la solicitud; **NO confirma** la versión que Cloudflare tiene desplegada ni que PRD permita lecturas/escrituras.

No se ha accedido a las suscripciones reales, no se ha realizado ninguna petición POST al Worker público y no se han enviado notificaciones.

## 2. Comprobación de versión viva

La conexión de este chat no incluye administración de la cuenta Cloudflare Workers. Se ha consultado disponibilidad de conectores y no hay acceso operativo a su código/versiones desplegadas. El endpoint público tampoco pudo consultarse de forma concluyente mediante las herramientas HTTP disponibles. Por tanto:

**Estado de versión desplegada: NO VERIFICADA.**

Acción de control necesaria con acceso autorizado a Cloudflare: abrir el Worker **`lasala-send-push`**, comprobar código y despliegue en servicio, verificar si `fetch()` exige autenticación/firma **antes** de cualquier consulta de RTDB o envío Web Push, verificar base Firebase referenciada, permisos/secretos y configuración `scheduled()` del recordatorio semanal. Anotar ID/fecha del despliegue. No copiar secretos a documentos ni logs. Evitar cualquier prueba que entregue notificaciones a usuarios reales. Si la versión viva carece de autenticación, priorizar mitigación urgente y acordar el posible cese temporal de Push antes de modificar el servicio.

## 3. Prototipo aislado de protección, no publicable por sí solo

Se añadieron los ficheros:

- `docs/firebase/prototype-push-worker-gate.cjs`
- `docs/firebase/prototype-push-worker-gate.test.cjs`

El prototipo utiliza **Web Crypto HMAC-SHA256** para autenticar solicitudes servidor→Worker, vincula firma a método/ruta/timestamp/nonce/body y **rechaza** peticiones sin firma, repetidas, expiradas, alteradas, con formato incorrecto, con campos `target/title/body` libres o método distinto de POST. No habilita CORS público. El cuerpo permitido es exclusivamente `{kind,referenceId}`. Es un componente CommonJS para pruebas, no un Worker completo listo para desplegar. No implementa entregas reales ni cron.

La implementación real necesita antes de cualquier envío: backend emisor autenticado que construya el evento validado; secreto exclusivo para la firma en entorno protegido; **almacén durable con reserva atómica de nonce** (no `Map` en memoria ni KV sin garantía atómica); verificación del evento/origen/permisos, obtención del destinatario desde datos de servidor, límites de frecuencia, deduplicación, gestión de tokens y suscripciones, auditoría no sensible y migración de usuarios. Si no hay servicio de reserva de nonces, **fallar cerrado**, nunca desactivar ese control.

**Importante:** el navegador TEST existente llama al Worker directamente sin firma. Desplegar esta puerta antes de migrar el frontend y las rutas servidor **cortaría el envío de Push**. La aplicación, Cron Tuta y reglas Firebase deben conservar su comportamiento hasta acordar el corte controlado.

## 4. Ejecución GitHub Actions verificada

Ejecución `https://github.com/Paulalasala26/LaSalaAppp/actions/runs/41809577240`, commit `7180a9c14467`, `test/v1.0`, **completed/success**. Se consultaron pasos y logs del job:

| Pruebas | Resultado real |
|---|---|
| Matriz estática de reglas RTDB | 84 PASS |
| Contratos de autenticación API | 22 PASS |
| Concurrencia ETag aislada | 14/14 |
| Autorización Avisos/Push aislada | 16/16 |
| **Guard HMAC de Worker (nuevo)** | **19/19** |
| Emulador oficial RTDB en `demo-lasala-phase1` | 13/13 |

Todos los bloques **0 FAIL**. Las 19 pruebas nuevas no emplean Firebase, Graph ni Cloudflare; comprueban el componente aislado con Node.js y datos ficticios.

## 5. Restricciones y secuencia siguiente

1. Verificar código y versión **activos** del Worker mediante cuenta autorizada Cloudflare y decidir mitigación, sin probar enviando Push real.
2. Conservar los 12 endpoints actuales; preparar consolidación de Cron de auditoría `/api/admin-audit-prune`→`/api/admin-audit` con pruebas de permisos y ejecución. No modificar cron activo aún.
3. Incorporar API de Avisos/Push solo tras liberar el hueco, mover emisión al servidor, migrar las suscripciones y tratar cuentas múltiples en un mismo navegador.
4. Asegurar la nueva ruta con autenticación y pruebas de identidad/roles, destinatarios por evento, cuotas, deduplicación, modo offline y cron semanal Tuta.
5. Validación por gestor de Backoffice, backup reversible, QA de notificaciones y autorización expresa **antes de publicar**.

**No se ha modificado** el Worker real, `api/`, `index.html`, `vercel.json`, reglas RTDB activas, base de datos, `main`, DEV ni PRD. Únicamente prototipos de pruebas, workflow de CI y documentación en rama `test/v1.0`.
