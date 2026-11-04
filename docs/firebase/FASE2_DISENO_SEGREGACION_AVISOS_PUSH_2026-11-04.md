# APP R v3 — Seguridad Fase 2: segregación de Avisos y Push por usuario

**Fecha:** 04/11/2026 · **Rama de referencia:** `test/v1.0` · **Estado:** diseño técnico para revisión; **NO IMPLEMENTADO NI DESPLEGADO**.

## 1. Evidencia del código actual

Se analizó el `index.html` completo de TEST (24.950 líneas, leído como blob de GitHub), la API de autenticación y `lib/admin-avisos-read.js`.

| Componente | Comportamiento actual | Evidencia aproximada |
|---|---|---|
| Avisos | `lasala-avisos-usuario-v1`: mapa **completo** serializado como cadena JSON, indexado por nombre de usuario; cada navegador hace `window.storage.get` de la clave y PUT con ETag sobre **toda la clave** | index.html:635–668, 1373, 1385, 1417 |
| Campana | Visible para ADMIN/TÉCNICO; contador de `!leido`; refresco al volver a primer plano y cada 30 s | 1376–1401 |
| Emisión | `notificarUsuario(target,mensaje,titulo,extra)` crea aviso (id, fecha, visto, leido, evaluación, etc.); recorta a 30 por destinatario y llama a Push | 1407–1426 |
| Recepción | Un flujo marca `visto` o elimina; la vista ADMIN también elimina los avisos tras consultarlos | 1428–1495 |
| Evaluación | TÉCNICO marca leído; puede evaluar Bien/Mal y eliminar el aviso o registrar solución a problema y notificar al autor | 1593–1619, 1699–1775 |
| Backoffice | `lib/admin-avisos-read.js` lee **toda** `lasala-avisos-usuario-v1` por API ADMIN, aplica filtros y devuelve resultados de solo lectura (máximo 300 filas) | lib/admin-avisos-read.js:30–92 |
| Suscripciones Push | `lasala-push-subs-v1`: segundo JSON **global**, guardado por `currentUser`; activar/desactivar lo modifica con GET/PUT ETag del conjunto | index.html:1274, 1283–1330 |
| Entrega Push | Browser llama directamente al Cloudflare Worker con `{target,title,body}`, sin cabecera Authorization en esa llamada | index.html:1351–1363 |
| Sesión compartida | `doLogout()` borra la sesión Firebase, pero **no desasocia ni revoca la suscripción push del navegador**; `estaPushActivado()` solo comprueba si existe suscripción, sin verificar su propietario | index.html:927–943, 1332–1349 |

**Riesgos concretos:** bajo las reglas RTDB activas `$other`, cualquier sesión legítima con `appUser` puede leer/escribir los dos JSON completos, no solo sus avisos/suscripciones. La separación de vistas por `currentUser` es solo visual. En dispositivo con usuarios alternos, la suscripción del usuario anterior puede permanecer ligada a él tras cerrar sesión y generar notificaciones cruzadas. El código del Cloudflare Worker se mantiene fuera de este repositorio; **no sabemos si el Worker valida/remite de forma segura peticiones de origen desconocido**. No atribuir explotación real sin evidencias.

## 2. Decisión de diseño propuesta (no autorizada todavía)

**Mantener la lectura y todas las mutaciones de Avisos y Push detrás de una API servidor con autenticación Firebase y comprobación de rol/cuenta vigente.** No permitir escritura directa RTDB sobre la estructura nueva, incluso cuando el destinatario sea el propietario: así se aplican también las reglas de negocio (emisión a tercero, evaluación/resolución, retención y notificaciones).

### Estructura nueva RTDB (solo servidor; nombres propuestos)

```text
lasala-avisos-v2/
  <uid-destinatario>/
    <aviso-id> -> {titulo, mensaje, tipo, fecha, visto, leido, evaluacion, observaciones, ...,
                   createdAt, updatedAt, version, senderUid, recipientUid, origen}
lasala-push-subs-v2/
  <uid-propietario>/
    <device-id-derivado> -> {subscription, createdAt, updatedAt, version, lastConfirmedAt}
```

**Claves de usuario:** usar `auth.uid` estable, calculado por la autenticación como `lasala-` + SHA256 del nombre normalizado (40 caracteres hexadecimales), no nombre mostrado ni identificador enviado por el cliente. El backend resuelve destinatarios de forma autorizada contra identidades/roles actuales. El identificador de dispositivo será un hash del endpoint de suscripción, sin publicar claves ni permitir que el cliente elija un UID arbitrario.

**Reglas candidatas para nuevos nodos:** `.read:false` y `.write:false` para todos los clientes; solo servicios privilegiados operan. **No añadir estas claves ni modificar `$other` en reglas activas** hasta contar con rutas servidor funcionales, pruebas oficiales del emulador y autorización. La consulta autorizada se sirve desde la API, de manera que no dependa de reglas de lectura de clientes.

## 3. Contrato de operaciones de API (propuesta)

Un único servicio lógico `Avisos/Push` con acciones controladas. **No crear todavía nuevas funciones Vercel**: actualmente el proyecto mantiene **12 API serverless**; cualquier endpoint físico nuevo exige primero aprobar una consolidación de rutas que respete ese límite.

| Operación | Actor | Requisitos de servidor |
|---|---|---|
| `GET mine` | Usuario vigente | Leer solo `recipientUid=uid` de la identidad validada; no aceptar un UID arbitrario |
| `GET list-admin` | ADMIN activo | Consulta paginada/filtrada para Backoffice; nunca exponer endpoints push ni secretos |
| `POST emit` | Actor autorizado por evento | Recibir **tipo de evento e identificadores de contexto**, no un texto/target libre; reconstruir el destinatario real y título/mensaje desde datos autorizados |
| `POST mark-seen/read` | Destinatario | Actualizar solo su aviso; idempotente con versión/ETag y no repetir alertas |
| `POST evaluate/resolve` | Destinatario TÉCNICO autorizado | Aplicar transición de estado y responder a autor cuando corresponda; proteger de dobles envíos y eliminar solo según la semántica vigente |
| `POST dismiss` | Destinatario, según flujo | Respetar limpieza ADMIN y expiración; nunca borrar aviso ajeno |
| `POST push-register` | Usuario de sesión vigente | Registrar solo el endpoint del dispositivo para su UID; límite y deduplicación por hash de endpoint |
| `POST push-unregister` | Propietario validado | Desvincular su endpoint/id, idempotente; no permitir borrar los de otra persona |
| `POST push-dispatch` **interno** | Servicio confiable | El navegador nunca elige `target` libre para Cloudflare; firma/autentica llamada backend→Worker, comprueba elegibilidad y no entrega a cuentas desactivadas |

Toda mutación usa control CAS `ETag` y versión del registro, códigos 401/403/404/409 coherentes y auditoría de errores sin registrar endpoint ni claves push. Los roles y la actividad de la cuenta se contrastan con `lasala-roles-v1` / `lasala-users-v1` en cada petición. No basar autorización únicamente en `auth.token.role` porque podría quedar obsoleto.

**Cloudflare:** antes de habilitar `push-dispatch`, obtener el código/configuración del Worker y comprobar autenticación servidor-servidor, deduplicación, secretos, límites y revocación de suscripciones. Ahora mismo la llamada del cliente carece de `Authorization`; no sabemos qué controles implementa el Worker. **Bloqueante de seguridad.**

## 4. Semántica que no debe alterarse

- La campana ADMIN/TÉCNICO y el punto rojo cuentan los avisos `!leido`; deben continuar actualizándose al entrar, al recuperar foco y periódicamente.
- Mantener `visto` distinto de `leido`; visualizar no equivale a evaluar.
- Preservar la limpieza automática de avisos temporales, la eliminación al consultar notificaciones ADMIN y el flujo TÉCNICO de evaluación/resolución del problema de riego. **No inventar scoring.**
- Mantener hasta 30 avisos por destinatario conforme al comportamiento actual (cambiar retención requiere decisión independiente).
- Conservar notificaciones por eventos de Riego (propuestas, hojas marcadas/corregidas, problemas y soluciones), Tareas y destinatarios derivados de guardias. No confiar en destinos aportados libremente por el frontend.
- Respetar el modo offline del resto de la aplicación; Avisos/Push no tienen una cola offline equivalente a QC. Ante fallo de red, no indicar que el aviso se ha enviado o el push está activo.
- El Backoffice continuará siendo **solo lectura** y deberá obtener información del nuevo almacén mediante API sin borrar ni marcar registros.

## 5. Riesgo adicional — mismo navegador, varias cuentas

Un `PushSubscription` pertenece al origen/navegador y no cambia automáticamente al cambiar de usuario de ViguerAPP. Actualmente `doLogout()` no revoca el push y el nuevo usuario podría ver como «activado» el botón de una suscripción registrada para otra persona.

**Comportamiento propuesto antes del corte:**
1. Registrar en servidor qué `uid` está asociado a cada endpoint y dispositivo, evitando múltiples propietarios simultáneos del mismo endpoint.
2. Al salir o cambiar de sesión, desasociar de forma segura el endpoint del UID anterior y confirmar la operación. Si la red falla, dejar anotada una revocación pendiente para reintentar; no mostrar un falso éxito. Evitar fuga de notificaciones mostrando como activo solo si servidor confirma propiedad de la suscripción.
3. En una nueva sesión, vincular el dispositivo **solo después** del consentimiento de Push y de la confirmación de la API. La desactivación debe retirar primero el registro en servidor y luego solicitar `unsubscribe()` local, gestionando reintentos.
4. Impedir el envío a una suscripción desactivada o de propietario diferente. Ensayar JULIO↔PILAR/otros usuarios en mismo navegador; no reutilizar nombres reales en logs de pruebas.

## 6. Migración segura y reversión

1. **Inventario y backup solo lectura:** exportar por cuenta de servicio `lasala-avisos-usuario-v1` y `lasala-push-subs-v1`; registrar fecha, versión, número de usuarios, número de avisos/suscripciones y suma hash de datos. No hacer esta extracción durante el diseño.
2. **Preparar v2 en emulador** con datos ficticios y casos de duplicados, registros sin ID, arrays irregulares, dos dispositivos y cambios concurrentes. Definir migración idempotente y no borrar históricos.
3. **Evitar carrera durante el cambio:** mientras clientes antiguos escriban `v1`, una simple copia v1→v2 pierde modificaciones. Diseñar ventana controlada de mantenimiento o doble escritura/conciliación servidor con checkpoints y detección de versiones; no marcar migración completa hasta comprobar la última delta.
4. **Desplegar en TEST por etapas:** API servidor, migración, lecturas v2, publicación frontend compatible y verificación de caché/SW; después cortar escrituras cliente v1. Las versiones antiguas deben fallar claramente (no aparentar haber guardado), y no deben efectuar envíos Push inseguros.
5. **Comprobar paridad:** por UID y por ID de aviso, estados leído/visto/evaluado, retención de 30, registros del Backoffice, suscripciones multidevice, envío a destinatarios correctos y ausencia de envíos cruzados.
6. **Rollback:** conservar copia validada de v1 y reglas exactas antes del cambio; para volver atrás reconciliar cambios recibidos en v2, no hacer un simple overwrite de snapshot antiguo. Recoger evidencia del gestor de Backoffice.

## 7. Matriz de aceptación — responsable: gestor del Backoffice

| Ensayo | Resultado exigido |
|---|---|
| Un usuario lee sus avisos | Solo propios; cero datos ajenos en JSON de respuesta |
| TÉCNICO evalúa aviso propio | Se conserva la semántica de evaluación y se rechaza aviso ajeno |
| ADMIN consulta Backoffice | Todos los destinatarios filtrables, en solo lectura; conserva límites y totalizadores |
| REGANTE informa problema y TÉCNICO resuelve | Flujo autor→destinatario→respuesta correcto, sin destinatario arbitrario |
| Riego notifica hojas/propuestas | Misma experiencia y contador de campana |
| Acceso REST directo a v2 con cualquier ID token | GET/PUT/PATCH/DELETE denegados, padre e hijos |
| Alta de 2 dispositivos del mismo usuario | Ambos reciben; no duplica |
| Cambiar A→B en mismo navegador | B nunca queda suscrito a avisos de A; A no recibe avisos en navegador compartido |
| Logout y fallo de red | No falso éxito; revocación pendiente visible y recuperable |
| Alta/baja concurrentes | ETag, deduplicación y ausencia de pérdidas |
| Worker recibe request sin autorización | Rechazo explícito, sin envío |
| Backup, migración, rollback | Conteos/paridad correctos y recuperación demostrada |

## 8. Situación y siguiente paso

**Solo diseño.** No se ha creado un endpoint operativo, publicado reglas, alterado JSON de Firebase, tocado `index.html`, `api/`, `dev/v1.0`, `main` o PRD.

**Bloqueante previo a implementación:** inspeccionar código y credenciales de autenticación del Worker Cloudflare, decidir el encaje del servicio dentro del límite de 12 funciones Vercel, y contrastar la política de destinatarios/emisión con el gestor. A continuación preparar prototipo de API y migrador solo en emulador, con tests aislados y sin datos reales.
