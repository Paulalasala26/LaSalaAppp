# ADR G1/G2 — Autoridad única de backend y seguridad de riego (04/11/2026)

**Decisión técnica propuesta · `test/v1.0` · Estado: NO-GO hasta aprobación del Backoffice y pruebas reales.**

Documento canónico estructurado: `arquitectura-backend-g1-g2-v3.json`. Referencia de operaciones: `contrato-integracion-riego-v3.json` (12 operaciones y 9 familias provisionales de avisos).

## Decisión

**Elegir, para el caso de UN solo invernadero, un agregado transaccional de Firebase Realtime Database accesible solo desde un backend autenticado**, con un documento `lasala-riego-authority-v3/<INV>` por invernadero. Dentro del mismo agregado: autoridad del usuario por INV, catálogo, bloqueo/epoch del escritor, cuadrícula, propuestas, problemas, comandos preparados, recibos, evidencias de eventos y outbox de avisos. El cambio de permisos, el de propuesta, el de riego y la creación del recibo/evento requieren concurrir sobre **la misma versión CAS o transacción RTDB**.

La implementación real no existe; la propuesta evita convertir una validación previa de permisos en un pase permanente para escribir. El `preflight` únicamente puede orientar la interfaz: al confirmar un comando se vuelve a comprobar su identidad, ámbito, cuenta, fase, epoch, precondición y destinos **dentro de la operación transaccional**, y si otro cambio ganó la carrera se rechaza o se reevalúa.

**El cliente no puede acceder directamente al agregado.** El backend retorna lecturas filtradas, recibos o errores controlados. Un Admin SDK con credenciales privilegiadas puede saltarse reglas RTDB: **las reglas no reemplazan la autorización del backend**, ni éste debe aceptar `role`, `actor`, `invId` autorizado, `serverVerified` o `epoch` aportados por el navegador.

La raíz y los endpoints escritos en este documento son **nombres candidatos de diseño**, no recursos disponibles ni APIs operativas.

## Contrato de transporte candidato

| Método/ruta futura | Función | Garantía requerida |
|---|---|---|
| `POST /api/riego-v3/intents` | Solicitud de intención de negocio; servidor valida JWT y crea identificador inmutable, sin confirmar riego | Evitar órdenes forjadas; registrar estado pendiente, origen y clave idempotente |
| `POST /api/riego-v3/intents/{referenceId}/commit` | Confirmación, revalidación completa y CAS sobre el agregado del INV | Cambio de riego/propuesta/problema, recibo y outbox juntos; sin Push antes |
| `GET /api/riego-v3/intents/{referenceId}` | Consultar estado real y recibo | Solo propietario/actor autorizado; distingue borrador, confirmado, conflicto |
| `GET /api/riego-v3/invernaderos/{invId}/riego` | Lectura filtrada por sala/rol | No exponer el catálogo de permisos ni el agregado bruto |
| `POST /api/riego-v3/backoffice/grants` | Cambios aprobados de acceso o bloqueo | Transacción en el **mismo documento por INV** que el escritor; auditoría |

En el borrador, la intención se crea en una zona protegida por servidor; su `referenceId` debe generarlo el servidor y asociarlo a usuario autenticado, INV, versión prevista y contenido inmutable. El comando únicamente puede confirmarse con recibo propio, no por comprobar un botón ni por haber obtenido un HTTP 202. Un `403` conserva la operación local pero bloquea replay automático; un `409/412` requiere nueva conciliación; `401` pide autenticación y `503` admite backoff con idempotencia y límite. No borrar cola offline sin recibo confirmado.

La autoridad real de permisos **se migrará** desde `lasala-roles-v1` y asignaciones separadas. Mientras éstos sean maestros independientes no habrá una garantía TOCTOU completa. El backend de gestión del Backoffice debe cambiar los grants de cada INV mediante **la misma frontera transaccional**. No se permite que la UI administrativa ni scripts antiguos cambien una «copia de roles» por fuera de esa frontera y sigan considerándose autoritativos.

## Lo que NO resuelve esta decisión

- **Multi-INV:** dos documentos por INV no forman una transacción atómica entre sí. Para aceptar una propuesta que modifique varias instalaciones, decidir un coordinador y un protocolo probado con retenciones, reconciliación de caídas y no visibilidad parcial, o restringir esas operaciones hasta disponer de una unidad transaccional común. **NO-GO para multi-INV**.
- **Revocación global inmediata:** un cambio de usuario con permisos en múltiples INV exige inmovilizar y modificar todos los documentos afectados y verificar cada recibo antes de declarar completada la revocación. **No es una revocación global instantánea y atómica**. Si ese requisito es imprescindible, se precisa otra autoridad común capaz de serializar cada commit y revocación, con un coste de contención explícito. No afirmar que verificar JWT en una lectura independiente cierra por sí solo la carrera.
- **Escalabilidad:** un agregado por INV puede crecer con eventos, propuestas y recibos. Medir tamaño, concurrencia, rendimiento y retención; definir archivo/compactación sin retirar pendientes ni romper la garantía de idempotencia o el orden de commit. La elección definitiva queda condicionada a esos ensayos.
- **Legado:** `lasala-riego-v2-<INV>` sigue siendo un string con ETag; `lasala-propuestas-riego-v1` es un array global, y avisos y problemas se originan en otras rutas. **No desplegar** la candidata §0.238: bloquea escrituras globales de índice/propuestas y rompería flujos actuales. El corte requiere backfill/snapshot verificado, reglas privadas aplicadas antes de datos nuevos, cierre comprobado del escritor viejo y rollback real.
- **Guardias, retención y notificaciones:** confirmar calendario Europe/Madrid y sustituciones con Backoffice; outbox del servidor crea avisos únicamente después de origen confirmado. Mantener cron Tuta de Cloudflare separado, sin duplicados. Nunca reconstruir Push antiguos por importar datos.

## Reglas privadas y seguridad — solo servidor

Se añade la **denegación candidata, solamente en el archivo del emulador** `database.rules.test.candidate.phase2-riego-freeze.json` para `lasala-riego-authority-v3` (`.read=false`, `.write=false` para clientes). Las pruebas del Firebase RTDB Emulator verifican que ningún rol de navegador, incluido ADMIN, pueda leer/escribir allí, pero esto **no despliega una regla real**. Antes de la integración serán obligatorias una auditoría de las reglas desplegadas, roles efectivos del servicio, revocación en caliente, pruebas de rutas legacy y protección frente a escrituras directas por REST. El código servidor con permisos administrativos debe disponer de controles propios, credenciales segregadas, auditoría y mínimos privilegios.

Documentación oficial que fundamenta el diseño: [transacciones RTDB](https://firebase.google.com/docs/database/admin/save-data), [precedencia y herencia de reglas RTDB](https://firebase.google.com/docs/database/security/core-syntax) y [Admin SDK y permisos](https://firebase.google.com/docs/database/admin/start). Las funciones de transacción pueden reintentarse: **no enviar notificaciones ni producir efectos externos dentro de su callback**. Publicar avisos desde el outbox confirmado, nunca desde la transacción mientras se evalúa.

## G1 — Pendiente de aprobación funcional

No se ha aprobado ninguna de las siguientes decisiones: permisos exactos por usuario y sala; aceptación/rechazo/edición de propuestas, incluyendo multi-INV; borrado de riego y marcado de ejecutado; guardias, sustituciones, reportante y destinatarios; ventana de corte y dispositivos offline. El gestor del Backoffice mantiene la última palabra funcional. El contrato de 12 operaciones y nueve eventos sigue como **candidato no aprobado**. Ninguna prueba automatizada sustituye esa aprobación.

## G2 — Arquitectura definida, implementación todavía no realizada

El JSON adjunto contiene seis pruebas de salida: raíz privada en el emulador, JWT/roles reales por INV, cierre del escritor antiguo, transacción con revocación y outbox contra Firebase Emulator, protocolo multi-INV y revocación global, y pruebas de tamaño, backup, retención y recuperación. La denegación privada del emulador es una evidencia **de diseño**, no un permiso para activar nada. Los demás gates técnicos permanecen **NOT_IMPLEMENTED**.

**Estado:** G1 = pendiente de decisión/validación del gestor. G2 = propuesta técnica formalizada y pendiente de implementar y demostrar. **NO-GO de despliegue**.

## Integración con QA

El usuario está realizando en paralelo **más de 2.700 pruebas de frontend**. Esa ejecución es una línea independiente: no se debe modificar su interfaz durante la auditoría ni considerar esas pruebas automáticamente finalizadas o superadas. Los tests de este ADR validan coherencia de la arquitectura candidata y reglas en emulador; el cierre futuro consolidará incidencias reales con su evidencia original, sin sumar recuentos.

**Próximo paso de ejecución real, previa autorización:** implementar primero un gateway JWT y una transacción con revocación por INV en entorno totalmente aislado, después validar migración/corte de un INV y coordinar los cambios operativos con QA. No activar G3/G4/G5 por adelantado.
