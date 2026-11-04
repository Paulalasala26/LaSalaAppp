# APP R v3 — Fase 2: bloqueantes para retirar el comodín Firebase `$other`
**Fecha:** 04/11/2026 · **Estado:** auditoría y diseño, **NO IMPLEMENTADO** · Rama `test/v1.0`.

## Evidencia directa del frontend TEST
Se recuperó el `index.html` completo (24.950 líneas) mediante GitHub `fetch_blob` y se inspeccionaron estos puntos, que actualmente permiten acceso RTDB desde el navegador:

| Familia | Evidencia de acceso en frontend | Consecuencia de seguridad / dependencia |
|---|---|---|
| Tareas | `TAREAS_KEY='lasala-tareas-v1'` (línea ~1154); `loadTareasData` lee `window.storage.get` (~1206); `persistTareasData` y `avisarNuevasTareas` usan `actualizarStorageJsonConEtag` (~1212, ~1252) | Conjunto de tareas escrito como JSON completo; permitir PUT por rol deja modificar tareas de otros. Se necesita API por acción/tarea o datos segmentados |
| Avisos | `AVISOS_USUARIO_KEY='lasala-avisos-usuario-v1'` (~1373); lectura global y acceso a `cloud[usuario]` (~1385), escritura ETag sobre el mapa global para `target` (~1417), lectura/marcado/borrado (~1431–1490) | El control por destinatario **no puede garantizarse** con un único JSON global si el cliente lo lee y sobrescribe íntegro; proponer API o claves por destinatario |
| Mantenimiento | `MANTENIMIENTO_KEY='lasala-mantenimiento-v1'` (~1865); lectura directa (~1904), generación automática/reprogramación, persistencia y transiciones de peón mediante ETag (~1914, ~1944, ~1958) | Estado, archivo, asignados y recurrencia comparten objeto monolítico; distinguir transición de asignado frente a gestión |
| Riego | `RIEGO_V2_PREFIX='lasala-riego-v2-'`, índice v2, señal sync (líneas ~13233–13239); REST por INV con ETag y sincronización en vivo | Permisos por invernadero/rol sin bloquear escrituras del regante, índice, señal sync ni cola offline |
| QC | `CONTROL_ITEMS_V2_INDEX_KEY` y `CONTROL_ITEMS_V2_PREFIX` (~5727–5735); lectura directa de shards por tipo/quincena (~5772), actualizaciones ETag del índice (~5865–5880) | La API de mediciones protegida **no** elimina accesos directos a registros QC. Separar Túnel/Carga/Ubicación, con permiso por tipo y verificación de origen |
| Fito | `FITO_V2_INDEX_KEY` y `fitoV2Key(invId)` (~15934–15935); consulta de nodos por INV vía `window.storage` | Requiere operaciones por INV, compatibilidad histórica y control de celdas/ETag |
| Específicos | `ESPECIFICOS_V2_INDEX_KEY`, nodos INV y buckets de partida (~21674–21726); lectura de buckets vía `window.storage` (~21740–21754) | Preservar referencias a partidas, revisiones de histórico y operaciones por calle/INV/bucket |
| Push | `PUSH_SUBS_KEY='lasala-push-subs-v1'` (~1274) | La suscripción debe quedar ligada a propietario; un mapa global no puede ser editable por cualquiera |

Estas son **evidencias de llamadas y almacenamiento**, no autorizaciones funcionales acordadas. No se han confirmado los derechos finales por rol/sala/destinatario; las decisiones deben recaer en el gestor del Backoffice con los responsables funcionales.

## Orden seguro de endurecimiento
1. **Acceso servidor**: completar verificación de Fase 1 para cuatro nodos; mantener bloqueados directos cliente cuando se apruebe, sin bloquear funciones administrativas.
2. **Privacidad y autoridad por usuario**: priorizar `lasala-avisos-usuario-v1` y `lasala-push-subs-v1`: lectura/escritura por destinatario y usuario. Preferir API servidor o modelo `/usuarios/{uid}/...`; diseñar migración gradual con lectura histórica.
3. **Tareas y Mantenimiento**: pasar las mutaciones a APIs que reciban `id + acción + versión`, comprueben usuario/rol/asignación y escriban con CAS (ETag). Mantener la semántica del archivo, recurrencia y avisos; no conceder al PEÓN escritura sobre todo el listado.
4. **QC**: separar consulta, registro y edición por rol y tipo (`carga` vs `tunel`); resolver el acceso directo de ficha QC y el índice v2. Mantener cola offline y galería SharePoint.
5. **Riego/Fito/Específicos/Partidas**: segmentar por INV, autorizar la sala asignada y preservar conflictos, índice, sincronización, histórico, mapas y colas.
6. **Cerrar comodín**: sustituir `$other` permisivo por denegación por defecto únicamente después de que cada familia operativa disponga de una vía autorizada y pruebas de regresión completas.

## Política de permisos — requisitos preliminares, NO reglas
- `ADMIN`: puede gestionar entidades mediante APIs con control de rol vigente.
- `TECNICO`: tiene operaciones QC autorizadas; **no** equivale a permiso universal para modificar infraestructura, cuentas o datos de otras personas.
- `REGANTE`: necesita Riego/Fito/Específicos según autorizaciones **por INV** que deben documentarse.
- `PEON`: necesita completar/transicionar **solo sus tareas/tickets** permitidos.
- `CARGADOR`: opera QC Carga; nunca otorgar escritura QC Túnel por simple posesión de token.
- **Todas las identidades**: leer/cambiar solo avisos y push propios, salvo acciones explícitas del gestor que se hagan por API.

**Nota:** los ejemplos son límites de seguridad, no una matriz completa de permisos de negocio. **No transformar estos requisitos en reglas desplegables** sin validar asignaciones por usuario/sala, controles de sesión/roles y consumidor de cada nodo.

## Puertas de validación
- Contratos de API: auth de usuario + estado actual en `lasala-roles-v1`, permisos por objeto, operaciones atómicas, gestión de 409/412 y revisión de retrocompatibilidad.
- RTDB Emulator: matriz positiva/negativa anónimo y cinco roles; lectura de registros **existentes** y escritura en hijos; ningún acceso transversal.
- UAT por gestor Backoffice: asignaciones, Tareas, Mantenimiento, QC Túnel/Carga, Riego/Fito/Específicos por INV, offline→sync y fotos.
- Backup, reversión exacta, registro de versión de reglas y aprobación expresa antes de publicar en TEST.
- **Bloqueante actual:** no se ha podido verificar el resultado de GitHub Actions al no estar disponible una consulta de `push` runs con las herramientas presentes; el estado Vercel READY no acredita las pruebas Firebase.

**Sin modificaciones en** reglas activas, `database.rules.test.json`, APIs, `index.html`, datos, DEV y PRD. Solo informe técnico.
