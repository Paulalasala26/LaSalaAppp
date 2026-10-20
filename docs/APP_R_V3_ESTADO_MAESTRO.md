# VIGUERAPP / APP R v3 — ESTADO MAESTRO CANÓNICO

**Revisión:** 19/10/2026 (España) · **Responsable del estado:** esta conversación, con verificaciones GitHub/Vercel y confirmaciones expresas del usuario.

> **LEE ESTO ANTES DE PLANIFICAR O MODIFICAR APP R EN CUALQUIER CHAT O CHATGPT PROJECT.**
> Este es el **único inventario vivo** de trabajo terminado y pendiente. Los handovers DOCX y otros `docs/*.md` con fechas anteriores son **histórico**, no una nueva lista de tareas. El repositorio es la fuente de código; la confirmación funcional del usuario es la fuente de la prueba de aceptación. **Nunca conviertas un pendiente histórico en pendiente actual sin contrastarlo.**

## 1. Reglas innegociables

- GitHub: `Paulalasala26/LaSalaAppp`. **Única rama de trabajo: `test/v1.0`** (no crear ramas adicionales).
- Vercel TEST: https://la-sala-app-test.vercel.app. Firebase RTDB TEST: `la-sala-app-test`.
- `main`/PRD **intocables** sin permiso explícito del usuario; SHA de `main` corroborado el 19/10: `84c67fe934d2c34e57ce6b65cf9dca14246fec90`.
- Código funcional base al redactar este documento: `60347e616679f7807db532d05ba904c81de1cfca`; TEST Vercel confirmado READY de ese SHA. **El commit que añade/actualiza este propio documento es posterior**. Leer HEAD/READY reales en cada nueva sesión, jamás copiar SHA antiguo como si fuera actual.
- Modificar lo mínimo, probar sintaxis/lógica y verificar que alias Vercel TEST sirve exactamente el nuevo SHA antes de anunciar un despliegue.
- No datos falsos, no guardar inspecciones ficticias, no borrar históricos, no rehacer trabajo ya validado. Avanzar **un paso** cada vez con el usuario.
- QC: **indicadores y alertas exclusivamente informativos; jamás rechazos/bloqueos/liberaciones automáticos**.
- Operarios **solo frontend**; Backoffice **ADMIN**. Diferenciar pruebas administrativas de la futura experiencia de campo.
- Español de España, sintético, sin textos residuales de prueba ni relleno en interfaz.

## 2. ESTADO FUNCIONAL ACTUAL — NO REABRIR SIN INCIDENCIA

**Leyenda:** `VALIDADO USUARIO` = prueba/confirmación humana; `IMPLEMENTADO` = existe código o pantalla, puede requerir UAT; `ABIERTO` = intervención realmente por terminar; `NO COMPROBADO` = evitar afirmar cierre.

| Área | Estado 19/10/2026 | Qué se sabe y regla de continuidad |
|---|---|---|
| **RIEGO — frontend, concurrencia, edición, navegación, impresión** | **VALIDADO USUARIO / CERRADO FUNCIONALMENTE** | Segmentación y lectura por invernadero, guardado dirigido, sincronización, ETag/conflictos, navegación y retorno desde Backoffice, cabeceras y pantallas. El usuario confirma expresamente el 19/10 que **Riego ya se hizo**. No listar «revisar Riego» como tarea abierta genérica. Batería final transversal de salida a PRD es otra cosa. |
| **REGISTROS RIEGO (Backoffice)** | **VALIDADO USUARIO / HECHO** | Consulta, filtros, edición, impresión y retorno al listado, conservar filtros. No volver a implementarlo. |
| **HISTÓRICO / AUDITORÍA** | **VALIDADO USUARIO / HECHO** | Histórico unificado de Riego, QC y administración; filtros, búsqueda, exportación CSV y retención de referencia de 1 año. El usuario confirma el 19/10 que **historiales ya se hicieron**. No listar «implementar históricos» como pendiente. |
| **AVISOS, HOME, NAVEGACIÓN CONTROL** | **IMPLEMENTADO Y REVISADO EN TEST** | Avisos reorganizados, frontend azul coherente, botones Próximamente deshabilitados, navegación de fechas/quincenas compacta. No ofrecer un rediseño genérico sin incidencia concreta. |
| **BACKOFFICE — roles** | **VALIDADO USUARIO 19/10** | Usuarios sin ADMIN bloqueados al abrir Backoffice; usuario autorizado conserva acceso a Control frontend. |
| **QC TÚNEL/CARGA — tarjetas y formulario** | **VALIDADO USUARIO 19/10** | Tarjetas Túnel correctas, formulario móvil completo. Check Carga validado. Protección al cerrar con cambios, cancelación y descarte probados. |
| **QC MEDICIONES — validaciones** | **VALIDADO USUARIO 19/10** | Número de bandejas inspeccionadas obligatorio; Color, Tamaño, Sanidad, Flores y Raíces cuadran respecto al total según reglas; se bloquea faltante, exceso y categoría vacía. Guardado real confirmado. Nunca volver al antiguo handover que dice «falta implementar el cuadre». |
| **QC GUARDADO, VERSIÓN Y UX** | **VALIDADO USUARIO 19/10** | API con concurrencia ETag/versionado; persistencia real y confirmación. Tras guardar **mantiene abierta la inspección** tanto en Túnel como Carga; cierra únicamente por acción del usuario. Guardar no se repite si no hay cambios. Código `60347e61`. |
| **QC «INSPECCIONADO» / PENDIENTES-COMPLETADOS** | **VALIDADO USUARIO 19/10** | Estados cuantitativos verificados por ID/tipo/día/partida; filtros de lista funcionan. Endpoint de lectura agrupada incorporado a API existente, **sin crear 13ª función Vercel**; commit `a5462966`. |
| **QC INDICADORES** | **VALIDADO USUARIO 19/10** | Cantidades y porcentajes visibles en «Indicadores guardados»; no hay rechazo automático. **Que se vean porcentajes NO significa que las tolerancias de negocio estén definitivamente acordadas**. |
| **FOTOGRAFÍAS QC** | **VALIDADO USUARIO EN RECORRIDO PROBADO** | Fotos correctamente asociadas a inspección; en cuenta/navegador probado no figuraban pendientes locales; SharePoint operativo en flujo administrativo. **No equivale** a validar de extremo a extremo las fotos offline del frontend de operarios. |
| **BACKOFFICE CATALOGOS** | **IMPLEMENTADO** | Gestión de salas/invernaderos/opciones/usuarios en TEST; crear, editar, desactivar y reactivar, nunca eliminar. No llamar «pendiente de construir» a módulos que existen. Cualquier ajuste nuevo debe tener incidencia concreta. |
| **QC OFFLINE — consulta móvil** | **VALIDADO USUARIO 19/10** | Usuario confirma lectura previa de partidas, consulta con modo avión y regreso con conexión a Check Túnel/Carga. No equivale a validar captura cuantitativa ni sincronización offline. |

## 3. TRABAJO REALMENTE ABIERTO / NO VALIDADO EN TODA SU EXTENSIÓN

1. **QC offline en frontend de operarios (CONSULTA VALIDADA; BORRADORES EN PRUEBAS).** La consulta de partidas en móvil con modo avión y posterior reconexión fue **VALIDADA POR USUARIO el 19/10**. Primera captura de cantidades en **borradores locales IndexedDB** implementada en TEST, pendiente de validación; aún **no hay sincronización** ni fotos offline. La caducidad de 24 horas no se ha probado envejeciendo una copia. Piloto Backoffice independiente.
2. **Fotos QC offline y sincronización desde frontend operativo.** El piloto de cola persistente en IndexedDB, subida SharePoint, verificación y eliminación tras éxito existe en `admin/control.js`, `admin/qc-photo-queue.js` y `api/qc-fotos-sharepoint.js`. **Falta asegurar un flujo equivalente adaptado al operario**, sin acceso a Backoffice ni introducir formularios manuales: el operario captura la foto y los datos provienen de la inspección. Probar desconexión → captura → reconexión → vínculo único a inspección, sin duplicados.
3. **Cierre visual/operativo de Control.** Solo las simplificaciones específicas que el usuario señale, respetando Túnel, Carga, PDF, guiones, calles, observaciones, fotos, Ginés y datos históricos. La ficha cuantitativa convive con legado: decidir si procede retirar duplicidades **después de la aceptación**, no presumir que falta todo el frontend.
4. **Criterios/tolerancias QC.** Pantalla y motor existen; confirmar con negocio el contenido definitivo por estadio cuando se decida. No inventar límites; no rechazo automático.
5. **GS y maestro de partidas** (diseño posterior, no requisito nuevo automático). PDF de muestra **no equivale a formato definitivo**; no sustituir importadores existentes ni mezclar cantidades de partes con bandejas inspeccionadas.
6. **UAT de salida TEST→PRD.** Batería transversal final: roles, móvil, offline, conflicto/recuperación, datos reales, seguridad Firebase/Graph, rendimiento y despliegue reversible. **No confundir UAT final con rehacer funcionalidad ya terminada.** PRD solo tras autorización.
7. **Power BI/Dashboard empresarial** es trabajo analítico separado y no bloquea automáticamente la validación diaria de Riego/QC. Mantener distinción con dashboard QC ya disponible en Backoffice.

**No clasificar otros asuntos como pendientes por copiar listas antiguas.** Si hay duda, marcar `POR CONTRASTAR`, examinar GitHub y preguntar por el caso concreto; no anunciar una funcionalidad terminada como pendiente.

## 4. Arquitectura y límites que se deben preservar

- QC histórico: `lasala-control-items-v1`, `lasala-control-items-v2-index`, `lasala-control-items-v2-tunel-qN`, `lasala-control-items-v2-carga-qN`. No migrar ni borrar.
- Cantidades: `lasala-qc-mediciones-v1`; reglas: `lasala-qc-reglas-v1`. Los registros se identifican por **ID de inspección**, no solo por partida. El total de bandejas inspeccionadas **no es necesariamente** el total de bandejas informadas en GS/legacy.
- Raíces permite solape de defectos conforme a la validación específica, no suma ingenua de defectos únicos. No sumar entre Color, Raíces, Sanidad, etc.
- Roles QC: ADMIN Túnel+Carga, TÉCNICO Túnel+Carga, CARGADOR Carga; REGANTE/PEÓN no habilitados para mediciones. Autorización en servidor, no solo ocultación de botón.
- TEST Vercel Hobby límite de **12 funciones serverless**. El intento de endpoint independiente `api/admin-qc-estado.js` falló por ser la 13ª función; fue retirado e integrado en `/api/admin-qc-mediciones` (commit `a5462966`). No repetir ese error.

## 5. Qué fuentes prevalecen y cómo continuar entre los 3 proyectos/chats

**Jerarquía de veracidad:**
1. Restricciones y validaciones explícitas más recientes del usuario.
2. Estado actual de GitHub `test/v1.0` y estado de Vercel TEST (lo desplegado).
3. **Este documento maestro**, que se actualiza en cada hito.
4. Handovers, archivos antiguos y memoria: **solo evidencia histórica**; pueden estar desfasados y nunca reabren hitos.

**Protocolo obligatorio de inicio de conversación:**
1. Leer **ESTE archivo desde `test/v1.0`** (URL directa al final); comprobar HEAD actual y alias Vercel si se va a modificar código.
2. No reconstruir el roadmap desde handovers desactualizados ni generar listas genéricas de funcionalidades.
3. Localizar la sección `TRABAJO REALMENTE ABIERTO`, continuar por la tarea que corresponda y plantear **un paso concreto**.
4. Tras cada cambio funcional **validado por el usuario**, actualizar el estado aquí en **la misma rama TEST**, pasando ABIERTO→VALIDADO y anotando commit/fecha/verificación. No actualizar como «validado» por un simple deploy.
5. Antes de crear un DOCX de traspaso, actualizar este maestro. El DOCX es una instantánea secundaria y debe citar esta ruta; **nunca volver a crear otra fuente canónica paralela**.

**Plantilla de anotación:** `AAAA-MM-DD | módulo | acción | evidencia (commit, prueba) | estado validado/implementado/pendiente | siguiente paso`.

## 5.1. QC sin conexión — entrega incremental

**Estado:** consulta offline VALIDADA por usuario. Borrador cuantitativo offline IMPLEMENTADO EN TEST y NO VALIDADO; NO sincroniza.

- `assets/qc-offline-operarios-store.js`: almacenamiento local IndexedDB por usuario, rol, estadio y quincena; guarda únicamente ID, partida, fecha, nº bandejas comunicado y ubicación mínima. Sin cliente, fotos, credenciales ni copia de mediciones.
- `qc-offline.html` + `assets/qc-offline-operarios-screen.js`: consulta móvil de snapshots de menos de 24 horas, búsqueda por partida y filtros estadio/quincena; permite abrir un borrador local de cantidades.
- `assets/qc-offline-operarios-drafts.js`: borradores cuantitativos en IndexedDB, separados por usuario/rol/tipo/ID, con cuadre de las cinco categorías y solape de raíces; se conservan hasta sincronización posterior, pero **no envían nada**. Sin clientes, fotografías, credenciales ni datos ficticios. NO se guarda todavía versión remota ni hay sincronización: antes de una futura escritura debe verificarse el estado del servidor por ID y tratar conflictos.
- `sw.js` (ya usado para push): cachea pantalla offline y sus tres scripts; si falla la navegación a la raíz, sirve la pantalla local. No cachea `index.html` completo, APIs, Firebase ni tokens. Se registra al iniciar sesión online.
- `index.html`: al leer con éxito un shard QC se prepara su copia local; la sesión/rol deben coincidir al abrir la consulta. No crea nuevas API ni modifica la escritura de QC.

**Prueba de lectura COMPLETADA 19/10:** usuario confirma tres hitos: partidas online, consulta offline en modo avión y apertura normal al reconectar. **Prueba siguiente, NO VALIDADA:** abrir una partida en modo avión, anotar cantidades cuadradas, pulsar «Guardar en dispositivo» y reabrir su borrador. No se escribe en el servidor.

**Sincronización (NO IMPLEMENTADA):** debe requerir sesión online, GET del estado actual y versión por ID/tipo/día, revisión de conflictos, POST único con control de versión/ETag, verificación explícita y eliminación del borrador solo tras éxito comprobado. Jamás repetir a ciegas un guardado incierto. Fotos offline en fase posterior.

**20/10 — diagnóstico acceso:** al abrir `qc-offline.html` externamente se obtiene «No hay una sesión autorizada»; claves de login y consulta local contrastadas en `index.html`, sin discrepancia. Posible navegación desde distinto contenedor de navegador/PWA, NO constatado aún. Se añade en Control frontend, para ADMIN/TÉCNICO/CARGADOR, botón «Sin conexión» que mantiene el mismo contexto de navegador y protege la salida si hay cambios; el mensaje de acceso ahora explica que las sesiones no se comparten entre aplicaciones/navegadores. **IMPLEMENTADO en TEST, pendiente de aceptación en móvil; sin cambio de backend ni PRD.** Si online se reproduce la falta de lectura de cantidades QC, diagnosticar esa incidencia por separado en su API, no atribuirla automáticamente a offline.

## 6. Registro de hitos recientes (resumen; no transcribir conversaciones)

- **14/10**: Riego y su concurrencia corregidos; Registros de Riego e Histórico unificado, auditoría, filtros y CSV implementados/validados en el recorrido del usuario; reorganización de Avisos.
- **15/10**: modelo QC, API y formularios de cuantificación; descartadas interpretaciones antiguas que no cuadraban cantidades; arquitectura de fotos SharePoint con piloto administrativo.
- **19/10**: guardado real QC, ETag, protección cambios, validación cuadre por categorías, estados Inspeccionado/Completados, indicadores, fotos asociadas, ADMIN restringido y frontend operarios autorizados: **validaciones del usuario**. Túnel y Carga permanecen en ficha tras guardar (`60347e61`). **No reaperturar Riego ni Histórico:** el usuario corrige expresamente que ya están hechos.
- **19/10, continuidad**: se detecta deriva de 30 chats/3 ChatGPT Projects con handovers sucesivos. Se instaura este único registro maestro para evitar pérdidas de contexto.
- **19/10, offline operarios**: lectura sin conexión y recuperación online VALIDADAS por usuario. Nuevo borrador cuantitativo solo local implementado en TEST, pendiente de prueba; aún no se sincroniza y no hay fotos offline.

**Ruta fija:** `docs/APP_R_V3_ESTADO_MAESTRO.md` en `test/v1.0`.

**Lectura directa:** https://github.com/Paulalasala26/LaSalaAppp/blob/test/v1.0/docs/APP_R_V3_ESTADO_MAESTRO.md
