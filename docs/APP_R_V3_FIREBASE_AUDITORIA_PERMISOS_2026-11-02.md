# APP R v3 — Matriz de permisos Firebase por rol y nodo (auditoría sin cambios)

Fecha: **02/11/2026** · Entorno: **TEST** · Rama: **`test/v1.0`** · Proyecto Auth/Realtime DB indicado en código: `la-sala-app-test`.

**Estado:** auditoría estática completada; **reglas desplegadas en Firebase NO verificadas**. Este documento no autoriza, implementa ni despliega reglas de seguridad. La validación funcional y las futuras pruebas con usuarios corresponden al **gestor del Backoffice**. No tocar `dev/v1.0`, `main`, PRD ni `index.html` operativo.

## 1. Evidencias contrastadas

- `database.rules.test.json` contiene solo tres entradas de primer nivel: `lasala-users-v1` (lectura y escritura **false**), `lasala-roles-v1` (lectura si `auth.token.appUser` existe, escritura **false**) y `$other` (lectura **y escritura** si `auth.token.appUser` existe).
- `api/firebase-auth.js` emite un token de Firebase con claim `appUser` tras comprobar credenciales y rol. La corrección §0.201 impide ahora emitir nuevos tokens a usuarios sin alguno de estos roles: `ADMIN`, `TECNICO`, `REGANTE`, `PEON`, `CARGADOR`. **Los cinco roles sí cumplen la condición de `$other`**, sin más control por rol en ese archivo.
- `index.html` líneas ~515–668: `appFetch` adjunta token a las peticiones RTDB directas; `window.storage.get/set` consulta/escribe por clave; `actualizarStorageJsonConEtag` hace GET ETag y PUT condicional de **todo el valor de la clave** (a menudo una cadena JSON serializada). La autenticación usada por la app **no equivale a autorización del nodo** cuando una regla `$other` permite cualquier escritura.
- El módulo `api/admin-users.js` y demás `api/admin-*.js` verifican roles vigentes contra `lasala-roles-v1` y cuenta con hash activo antes de actuar; esas comprobaciones **no protegen escrituras REST que un navegador efectúe directamente** si las reglas abiertas estuvieran desplegadas.
- Los borradores QC y fotos fuera de línea usan **IndexedDB** (`assets/qc-offline-operarios-*.js`) y reenvían posteriormente a `/api/admin-qc-mediciones` y `/api/qc-fotos-sharepoint`. La cola general QC y la cola de Riego usan **localStorage** (`lasala-offline-queue-v1` y `lasala-riego-offline-v1` respectivamente) y sincronizan después por las rutas existentes, incluidas escrituras directas RTDB.
- Para los controles RTDB oficiales, consultar [Core syntax de Realtime Database](https://firebase.google.com/docs/database/security/core-syntax) y [comportamiento y herencia de reglas](https://firebase.google.com/docs/rules/rules-behavior). La concesión `.read/.write` en un padre **no puede revocarse en sus hijos**; las reglas **no son filtros**. No intentar reforzar nodos descendientes dejando `$other` permisivo en el padre.
  
**Separación obligatoria:** este archivo versionado es una **candidata/plantilla**; ninguna consulta efectuada en la presente auditoría ha leído la pestaña **Rules** activa del servidor, probado escrituras remotas con credenciales reales o demostrado que esa plantilla se desplegó. Por tanto, el riesgo **está demostrado para el archivo**, no confirmado en los datos reales.

## 2. Matriz exacta que produce el archivo versionado, si se desplegara

Abreviaturas: **L** = lectura; **E** = escritura; **–** = denegado. Son permisos del **archivo**, no del código de interfaz o de los endpoints.

| Nodo de primer nivel | Anónimo / sin claim | ADMIN | TÉCNICO | REGANTE | PEÓN | CARGADOR |
|---|---|---|---|---|---|---|
| `lasala-users-v1` | – / – | – / – | – / – | – / – | – / – | – / – |
| `lasala-roles-v1` | – / – | L / – | L / – | L / – | L / – | L / – |
| **Cualquier otra clave (`$other`)** | – / – | **L / E** | **L / E** | **L / E** | **L / E** | **L / E** |

**Consecuencia:** un operario autenticado podría, en ese escenario condicional, consultar/modificar por REST datos de otras personas, auditoría y configuraciones de Backoffice, controles QC, tratamientos, asignaciones y avisos, sin entrar en el Backoffice. No equivale a privilegio para cambiar `lasala-roles-v1`, que permanece bloqueado en el archivo. La denegación para usuarios anónimos depende de que las reglas realmente activas no tengan otra concesión.

**Ensayo lógico estático:** 5 roles × 33 rutas de primer nivel seleccionadas = **165 pares rol/nodo**, de los cuales la plantilla permite escritura en **155** y solo niega escritura para los 5 pares `users` y los 5 pares `roles`. El ensayo **no es el emulador oficial Firebase**, ni verifica el servidor LIVE.

## 3. Inventario funcional de nodos y flujos que deben protegerse

Convenciones: `C` = cliente/browser accede a RTDB directo; `S` = API servidor con token de servicio; `R` = lectura; `W` = escritura. Las columnas de roles indican **un flujo observado o un destinatario funcional**, nunca una decisión de permiso definitivo. **?** significa que la titularidad exacta requiere revisión con el gestor. A falta de confirmación, *no convertir ningún ? en DENY*.

| Nodo o familia RTDB | Uso/flujo identificado en código | Actor funcional / dependencia | Acceso actual en la plantilla `$other` | Decisión segura pendiente |
|---|---|---|---|---|
| `lasala-users-v1` | Identidades, hashes; `firebase-auth` y API Usuarios (**S R/W**) | ADMIN gestiona por API; login público verifica en servidor | Sin L/E cliente | **Mantener privado**, sin lectura cliente |
| `lasala-roles-v1` | Roles vigentes; login y API ADMIN (**S R**) y cliente heredado (**C R**) | Cinco roles autenticados + verificación servidor | L para todos, E para nadie | Determinar si lectura browser es imprescindible; nunca permitir E a clientes |
| `lasala-admin-audit-v1` | Auditoría administrativa y poda Cron (**S R/W**) | ADMIN consulta, servidor registra, Cron autorizado depura | L/E para todos los roles | Bloquear cliente y conservar S; comprobar retención de 1 año |
| `lasala-historial-v1` | Histórico operativo legado (`logHistorial`; **C R/W**) y lectura por API Auditoría (**S R**) | Productores diversos; revisión gestor | L/E todos | Proteger integridad y conservar cargas históricas |
| `lasala-config-infra-v1` | Salas e invernaderos vía `api/admin-catalog` (**S R/W**) | ADMIN | L/E todos | Cliente solo lectura si app realmente lo requiere; escritura solo ADMIN en API |
| `lasala-config-riego-opciones-v1` | Opciones Riego vía `api/admin-riego-options` (**S R/W**), vistas consumidoras de Riego | ADMIN edita; otros roles consultan (?) | L/E todos | Separar catálogo de consulta frente a escritura; validar 9 grupos/60 valores |
| `lasala-riego-v2-index`, `lasala-riego-v2-<inv>` | Riego quincenal por INV; `window.storage` y GET/PUT ETag (**C R/W**) | REGANTE según sala; ADMIN/TÉCNICO supervisan | L/E todos | Permisos por rol **y sala/INV**, conflictos ETag, sincronización móvil |
| `lasala-riego-sync-v1` | Señal de cambios y SSE/lectura de sincronización (**C R/W**) | Usuarios que observan Riego | L/E todos | Permitir señalización legítima sin falsificar otros INV |
| `lasala-riego-offline-v1` | Cola local `localStorage` (NO RTDB) | REGANTE/dispositivo | **No aplica a reglas RTDB** | Validar *reenvío posterior* a Riego v2 y control de conflictos |
| `lasala-fito-v1`, `lasala-fito-v2-index`, `lasala-fito-v2-<inv>` | Tratamientos Plaguicidas; compatibilidad v1 y celdas v2 (**C R/W**) | REGANTE y gestión de tratamientos (ADMIN/TÉCNICO: contrastar) | L/E todos | Autorizar escritura por operación/INV sin romper limpieza de jornada ni compatibilidad |
| `lasala-especificos-v1`, `lasala-especificos-v2-index`, `lasala-especificos-v2-<inv>` | Específicos por día/INV/calle (**C R/W**) | Regante/gestores, según pantalla | L/E todos | Separar consulta, altas, edición histórica, vínculos de tarea |
| `lasala-especificos-partida-v1`, `lasala-especificos-partida-v2-index`, `lasala-especificos-partida-v2-b<NN>` | Específicos en ficha de partida por bucket (**C R/W**) | Gestión de Partidas, Tareas y Específicos | L/E todos | No romper vínculo con partida, hash de bucket y edición puntual |
| `lasala-tareas-v1` | Lista general de tareas y operativas, asignación, archivo (**C R/W**) | ADMIN/TÉCNICO gestores; PEÓN/REGANTE/CARGADOR consultan o completan asignadas (?) | L/E todos | **Nodo monolítico**; no se consigue control por tarea/operario solo filtrando la UI |
| `lasala-mantenimiento-v1` | Tickets, asignados, recurrencia y ejecuciones (**C R/W**) | ADMIN/TÉCNICO alta; PEÓN ejecución / otros según flujo | L/E todos | Control de transición y firma, sin romper el reinicio periódico y archivo |
| `lasala-avisos-usuario-v1` | Mapa de notificaciones por destinatario, lectura, evaluación y eliminación (**C R/W**) | ADMIN/TÉCNICO y destinatarios | L/E todos | Privacidad por destinatario; si es cadena JSON monolítica, requiere **rediseñar persistencia** |
| `lasala-push-subs-v1` | Suscripciones push de usuarios (**C R/W**) | Usuarios suscritos, servidor eventual | L/E todos | No permitir leer/escribir suscripciones ajenas; validar token/dispositivo |
| `lasala-control-items-v2-index`, `lasala-control-items-v2-(tunel/carga)-q<n>` | Registros QC Túnel y Carga, shard por quincena (**C R/W**) | ADMIN/TÉCNICO; CARGADOR para Carga | L/E todos | Respetar segregación Carga vs Túnel; ETag y no pérdida de datos |
| `lasala-qc-mediciones-v1` | QC cuantitativo mediante `api/admin-qc-mediciones` (**S R/W**) | ADMIN/TÉCNICO; CARGADOR únicamente Carga | L/E todos | **No permitir acceso directo de escritura** que eluda control de origen/versión |
| `lasala-qc-fotos-sharepoint-v1` | Índice de fotos QC desde API Graph (**S R/W**) | Roles QC autorizados (CARGADOR solo Carga) | L/E todos | Bloquear acceso directo de escritura, preservar colas offline y SharePoint |
| `lasala-control-fotos-v1*`, índices fotos | Circuito de imágenes QC heredado (**C R/W**) | Roles QC por Túnel/Carga | L/E todos | Diferenciar legado de nueva biblioteca de fotos; evitar sobrescritura e inconsistencia |
| `lasala-control-invernadero-v1`, `lasala-conteo-tuta-v1` | QC/invernadero y conteos heredados (**C R/W**) | QC y personal autorizado (?) | L/E todos | Revisar propietario funcional y migración |
| `lasala-partidas-v1` | Inventario de Partidas legado (**C R/W**) | Gestión de Partidas, uso por otras pantallas | L/E todos | No confundir con maestro GS ni con APP Ocupación externa; preservar QC/fotos |
| `lasala-trabajos-v1` | Trabajos Mujeres/Túnel/Externos (**C R/W**) | ADMIN y perfiles operativos; TÉCNICO sin acceso a módulo según UI | L/E todos | Valorar roles exactos y evitar escritura desde un TÉCNICO vía REST |
| `lasala-checks-v1` | Checks operativos (**C R/W**) | Operarios responsables | L/E todos | No romper marcaje, concurrencia, histórico |
| `lasala-presencia-v1`, `lasala-clima-*` | Presencia y cuadro/clima (**C R/W** en varios nodos) | Usuarios operativos y supervisión (?) | L/E todos | Separar sensores/lecturas y escrituras manuales |
| `lasala-riego-ejecutado-v1`, `lasala-propuestas-riego-v1`, `lasala-indice-abonos-*` | Ejecución, propuestas y cuadros de abonos (**C R/W**) | REGANTE/gestores según función | L/E todos | Resolver rol y tramo de lectura antes de endurecer |
| `lasala-injerto-asignacion-v1`, `lasala-cargas-asignacion-v1`, `lasala-sala-en-vivo-manual-v1` | Asignaciones y estado sala en vivo (**C R/W**) | ADMIN/TÉCNICO/CARGADOR y perfiles de trabajo según pantalla | L/E todos | Confirmar asignación por usuario/sala e integridad |
| `lasala-offline-queue-v1` | Cola local `localStorage` (NO RTDB) | Técnico/Cargador y capturas QC | **No aplica a reglas RTDB** | Validar envío al reconectar a API y escritura de referencia QC |

> **Advertencia estructural:** `window.storage.set` y `actualizarStorageJsonConEtag` guardan con frecuencia el contenido como **cadena JSON completa**. Para esos nodos no bastan reglas anidadas de campos/hijos para impedir que el cliente sustituya el conjunto. Hacen falta (i) nuevo modelo de datos con hijos, (ii) operación servidor con validación, o (iii) una fase temporal con permisos controlados y pruebas explícitas por rol. **No aplicar una denegación genérica `$other` hasta cubrir cada llamada directa.**

## 4. Plan de endurecimiento propuesto — SIN IMPLEMENTAR

**Fase 0 — Verificar servidor (bloqueante):** responsable autorizado abre **Firebase Console → proyecto `la-sala-app-test` → Realtime Database → Rules**, identifica instancia y región, exporta SOLO **texto de reglas y fecha/revisión** (sin tokens ni datos de usuarios) y compara exactamente con `database.rules.test.json`. Si son diferentes, el análisis de permisos actuales se recalcula desde esa versión. No basta un despliegue READY de Vercel.

**Fase 1 — Aislar nodos puramente servidor (propuesta):** tras simulación y confirmación, hacer inaccesibles por cliente `lasala-admin-audit-v1`, `lasala-config-infra-v1`, `lasala-qc-mediciones-v1`, `lasala-qc-fotos-sharepoint-v1`, manteniendo APIs ADMIN y de QC como acceso autorizado. Revisar antes si existe algún consumidor directo que no haya sido inventariado.

**Fase 2 — Segmentar operaciones cliente:** Riego/Fito/Específicos por sala y por invernadero; controles QC por tipo Túnel/Carga; tareas, avisos y Mantenimiento por destinatario/asignado; suscripciones push por usuario. Donde se utilice un único JSON serializado, plantear migración por registro o un backend de escrituras con control de concurrencia. **No confiar en esconder botones por rol**.

**Fase 3 — Compatibilidad y despliegue gradual:** simulador oficial RTDB por rol, emulación de errores 401/403/permission_denied, pruebas con cuenta de cada rol y colas; desplegar primero al entorno aislado acordado, validar rollback y después aprobar cambio de reglas TEST. No hacer cambios directos en PRD.

**Fase 4 — Sesiones:** estudiar revocación y refresco de tokens cuando un usuario se desactiva o cambia de rol. Las APIs consultan roles en tiempo real; reglas basadas solo en `auth.token.role` podrían usar privilegios obsoletos hasta la renovación del token. Preferir política que contraste el rol vigente en la base o un mecanismo de sesión/revocación validado.

## 5. Pruebas que debe ejecutar el gestor del Backoffice antes de aprobar reglas nuevas

| Caso | Rol / condición | Comportamiento a comprobar |
|---|---|---|
| Inicio de sesión | Todos los roles, cuenta sin rol y desactivada | Cinco roles válidos entran; los otros casos denegados |
| Usuarios, Salas y Opciones Riego | ADMIN / TÉCNICO / PEÓN | Escritura ADMIN por API; denegación real de escrituras no permitidas por RTDB |
| Riego por sala | REGANTE1/2/3, ADMIN, TÉCNICO | Lectura y escritura previstas por INV, ETag, cambio de día y quincena |
| Riego offline | REGANTE con pérdida de red | Cola local, reintentos y consolidación sin duplicados ni pérdida |
| Plaguicidas | REGANTE y gestión | Registro, edición autorizada, compatibilidad v1/v2 e indexación |
| Específicos / Partidas | Perfiles autorizados | Alta individual, vínculo a partida, histórico y movimiento sin pérdida de QC |
| QC Túnel | ADMIN, TÉCNICO, CARGADOR | CARGADOR no puede editar Túnel ni por REST directo |
| QC Carga | CARGADOR, ADMIN, TÉCNICO | Lectura, escritura y evaluación específica Carga |
| QC fuera de línea | TÉCNICO/CARGADOR | IndexedDB → controles → mediciones → fotos; recuperación de error |
| Foto SharePoint | Perfiles QC | Subida y confirmación de origen, foto visible y borrado lógico autorizado |
| Tareas y Mantenimiento | ADMIN/TÉCNICO/PEÓN/REGANTE | Responsables, estados, archivo y recurrencia compatibles |
| Avisos y push | Cuentas distintas | Nadie puede leer, borrar o cambiar aviso/suscripción de otro |
| Auditoría | Todos | Histórico no modificable por operarios; Cron puede depurar |
| Permisos negativos | Sesión anónima, rol indebido, token expirado | Se deniega toda acción no autorizada, no se borra trabajo local |
| Regresión | ADMIN en PC/móvil | Backoffice y frontend operativo no dejan de cargar |

## 6. Decisión y traspaso

- **No se han modificado las reglas versionadas ni las desplegadas**, tampoco datos RTDB, roles, colas offline, `index.html`, `main` o `dev/v1.0`.
- Entregable de este bloque: mapa técnico de nodos, permisos **teóricos** de la plantilla, riesgos de persistencia monolítica y plan de test/rollout.
- **Bloqueante real:** sin confirmar la pestaña Rules de la instancia Firebase TEST no se puede afirmar que exista la vulnerabilidad en servidor ni aprobar un plan de reglas operativo.
- El **gestor del Backoffice** es responsable de validar el comportamiento de las pantallas. El endurecimiento y despliegue de reglas requerirán un responsable con acceso autorizado a Firebase y una aprobación separada.
