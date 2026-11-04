# APP R v3 — §0.234 · Plan de migración sin pérdida: riego, propuestas y avisos

**Fecha:** 04/11/2026 · **Ámbito:** diseño y auditoría, rama `test/v1.0` · **Estado:** arquitectura propuesta, sin aprobación funcional, sin migración ni acceso a datos reales.

## 1. Diagnóstico contrastado del código vigente

| Dominio | Fuente y forma actual | Consecuencia para el cambio |
| --- | --- | --- |
| Riego | `lasala-riego-v2-<invId>`: **valor RTDB tipo string** que contiene JSON por día/calle. `index.html:13939–13944,14127–14138,14227–14236`. | Un CAS sobre una versión de otra raíz no protege esta escritura. No convertir el string a objeto mientras queden lectores/escritores actuales. |
| Índice de riego | `lasala-riego-v2-index`: array JSON serializado con CAS propio. `index.html:13927–13935,13950–13978`. | Debe conciliarse con la existencia real de cada shard. No inventar invernaderos a partir del índice si el shard no existe. |
| Offline riego | `lasala-riego-offline-v1` en **localStorage por navegador**, con reintentos. `index.html:13564–13646,14083–14094`. | No existe inventario global del contenido de los dispositivos offline. Debe bloquearse el corte hasta que se sincronicen/concili(en) o se gestionen explícitamente sus operaciones. |
| Propuestas | `lasala-propuestas-riego-v1`: array serializado. `index.html:19336–19358`. La aceptación cambia riego y propuesta **en operaciones separadas** `19442–19504`. | La vista v3 debe conservar estados, autor, texto original/final, fechas y referencias; nunca inferir que la transición fue atómica en v1. |
| Avisos | `lasala-avisos-usuario-v1`: objeto por destinatario, array limitado a **30 registros por usuario**; `notificarUsuario` ignora fallo de guardado y aun así llama al Worker, `index.html:1407–1426`. La vista ADMIN puede eliminar avisos al abrir, `1461–1494`. | La copia inicial solo representa lo aún presente, **no el histórico completo**; un Push pasado sin aviso guardado no se reconstruye. No reenviar Push por importar avisos históricos. |
| Suscripciones | `lasala-push-subs-v1`: endpoints por usuario `index.html:1274,1296–1303`. | Respetar consentimiento por dispositivo, deduplicación de endpoints y cambios de usuario; no copiar endpoints compartidos sin resolver propietario. |
| Seguridad | Reglas candidatas de `docs/firebase/database.rules.test.candidate.phase2-avisos-push.json` protegen raíces nuevas en emulador. El wildcard `$other` sigue permitiendo escrituras v1 a sesiones autenticadas. | **Reglas emuladas no son reglas desplegadas**. Proteger raíces v3 **antes** de escribir el primer dato; el plan necesita inventario de todos los clientes antiguos. |
| Prototipos | `prototype-business-event-transaction-v2.cjs`, `prototype-event-resolvers-v2.cjs`, `prototype-avisos-push-migration-v2.cjs`. | Solo muestran propiedades en el emulador. No son compatibles directamente con formatos operativos ni crean autorizaciones de negocio reales. |

**No se han leído datos de ningún usuario ni de Firebase operativo.** Las formas se han confirmado examinando código en la rama de TEST, no con un muestreo de la base real.

## 2. Decisión de arquitectura propuesta

**Recomendación: v3 paralela y cerrada a clientes, con autoridad única por fase; no hacer doble escritura del navegador.**

- **Autoridad actual:** riego v2 string, propuestas y avisos v1; se mantiene mientras haya clientes actuales conectados o modificaciones offline pendientes.
- **Vista paralela de preparación:** snapshots **solo de lectura** y normalización v3 privada, por invernadero. Se permite releer y reimportar con deduplicación; **no se generan avisos ni Push** desde la copia.
- **Autoridad futura:** el comando del backend, con JWT validado, permisos confirmados por el gestor y una escritura CAS sobre una **unidad transaccional común** para cada operación. Para `riego_validado_modificado` puede ser un agregado por INV (`grid + commands + events/outbox`) tal como prueba §0.233. La lectura de la campana se puede derivar del outbox/event log confirmado, sin convertirse en segunda autoridad.
- **Propuestas que afectan riego:** el cambio de estado y la modificación de celdas deben compartir **una misma frontera transaccional** o utilizar un protocolo de estado pendiente/conciliación con compensación demostrada. La propuesta global v1 actual no la ofrece. **No activar** aceptación/cambio/rechazo de propuestas con el prototipo de una celda.
- **Problemas que cubren varios INV:** un documento por invernadero **no** da atomicidad entre dos o más invernaderos. Diseñar entidad coordinadora inmutable y estados verificables por INV, con entrega de avisos únicamente al completar la confirmación global; alternativa: un único agregado de negocio apropiado. Queda como decisión técnica pendiente.
- **Otros eventos:** marcado/corrección de hojas y problemas resueltos necesitan recibo de evento persistido, versiones, actor y estado exacto. La regla es **no publicar Push si no se ha confirmado origen y outbox**.
- **Guardias:** el backend resolverá FRAN/DENNIS desde fecha/hora servidor en `Europe/Madrid`; la gestión de sustituciones queda pendiente de validación y no se deduce del dispositivo.
- **No consumir el esquema demo literalmente:** los nombres `lasala-riego-event-aggregate-demo-v2` y `lasala-alert-event-ledger-v2` solo son candidatos de prueba; fijar identificadores finales y límites de tamaño/retención antes de UAT.

## 3. Fases, gates y evidencias exigidas

| Fase | Actuación permitida | Evidencia de salida y criterio GO |
| --- | --- | --- |
| 0 — Inventario y decisiones | Aprobación por gestor de ámbito técnico/INV, excepciones de guardia, comportamiento de avisos y conservación. Comprobar dispositivos, offline, roles y versión de Worker. | Acta funcional; inventario de claves y rutas; plan de copia y contactos para reversión. **GO sujeto a aprobación expresa.** |
| 1 — Seguridad | Simular y aprobar reglas privadas de raíces nuevas; desplegarlas de modo controlado **sin alterar aún escrituras v1**. Pruebas de lectura/escritura denegada desde sesiones cliente, incluidos ADMIN, y acceso servidor auditado. | Pruebas reales de reglas y acceso, registro de cambio y rollback de reglas. **No crear nodos v3 antes.** |
| 2 — Snapshot y dry-run | Exportar de forma autorizada los nodos fuente y ETags de riego por INV, índice, propuestas, avisos y suscripciones; guardar manifiesto con hashes canónicos y recuentos en soporte restringido. Ensayar con copias anonimizadas en emulador. | Copia restaurable comprobada; formatos/fechas/IDs validados; número de errores de parseo **0**. No introducir PII ni Push en fixtures de CI. |
| 3 — Sombra pasiva | Normalizar a una vista v3 **sin escritor cliente** y sin despachar eventos; contrastar por INV contra lectura actual. Conciliar cambios ocurridos durante la copia mediante ETag/hashes y watermarks. | Paridad completa del snapshot normalizado; informe de diferencias **0 no explicadas**, recuentos por INV/propuesta/destinatario, muestreo funcional. |
| 4 — Ensayo de comandos | Backend autorizado en entorno de ensayo: CAS, origen confirmado, outbox, idempotencia, offline/reintentos, cambio concurrente, aceptación/rechazo y problemas multi-INV. No reutilizar el Worker real para pruebas. | Pruebas negativas/positivas y de crash, seguridad, colas, concurrencia y recuperabilidad completas. Cada una de las **9 familias** validada expresamente. |
| 5 — Piloto acotado | Ventana aprobada por invernadero/usuarios piloto. Capturar snapshot justo antes; comprobar clientes y colas offline; **cerrar primero las vías de escritura antiguas** del ámbito piloto; promover una única autoridad. | Reconciliación previa al primer comando; cero escritor antiguo aceptado; conteos, permisos y pantallas comprobados por gestor; rollback ensayado. |
| 6 — Corte escalonado | Extender por cohortes tras aprobar piloto, sin convivir con dos escritores autoritativos del mismo INV. Migrar suscripciones verificadas y activar envío desde una única cola (sin duplicar Tuta). | Monitor de retrasos, errores, colas y versiones; criterios de parada y reversión; actas UAT funcionales. |
| 7 — Retirada controlada | Mantener v1 en **solo lectura** durante periodo aprobado; conciliar datos históricos y retención; retirar accesos/código solo tras ventana de estabilización. | Aprobación final, backups verificables y trazabilidad; ningún borrado automático de v1. |

**Regla principal:** **si no es posible impedir que un cliente antiguo u offline sobrescriba un shard ya migrado, NO se corta ese invernadero.** Un lector híbrido puede existir durante transición; **dos escritores autoritativos**, no.

## 4. Conciliación, duplicados y límites del legado

Para cada INV exportado, registrar: ID de shard, existencia, ETag original, hash del **valor JSON parseado y canonicalizado**, lista de días/calles, registros y marcas de validación, estado offline conocido por dispositivo y fecha de captura. Para índice v2, contrastar lista de IDs con nodos existentes y viceversa; un shard faltante con ID presente constituye **ERROR bloqueante**, no vacío.

Para propuestas, cotejar IDs únicos, estado `pendiente/aceptada/rechazada`, `propuestoPor`, INV, día, calles, texto inicial/final y cambios concurrentes. Mantener relación de cada transición con su evento canónico; no reescribir propuesta v1 «para ajustarla» a v3. Toda diferencia posterior a la copia exige nueva lectura del ETag y nueva conciliación; no afirmar igualdad a partir de un snapshot obsoleto.

Para avisos, importar solo los persistidos, con `migratedFrom`, `legacyId`, destinatario estable, versión y deduplicación. **No es posible garantizar recuperación del pasado borrado o truncado**. Separar contadores de migrados, perdidos/no recuperables y pendientes de investigación; no fabricar IDs de eventos de negocio para avisos que carecen de fuente fiable. Para Push, mantener consentimiento, no emitir notificaciones retroactivas y bloquear endpoints duplicados con propietario conflictivo. El prototipo `prototype-avisos-push-migration-v2.cjs` es un **dry-run de avisos y suscripciones**, no una herramienta de migración de riego o propuestas.

## 5. Reversión y recuperación ante interrupciones

**Antes del primer comando v3:** revertir rutas/flags, conservar snapshots y v1 sin modificar, deshabilitar lector sombra y detener trabajos v3. Comprobar que los usuarios siguen leyendo/escribiendo v1 sin pérdida.

**Después de recibir escrituras v3:** **NO** volver simplemente a v1: se perderían los cambios nuevos. Congelar nuevas escrituras y el despachador, exportar registro completo de comandos `committed` y recibos, y efectuar **replay inverso o conciliación asistida** sobre v1 con ETag por INV y revisión de conflictos. Verificar paridad y reabrir una única autoridad. Si el replay no está validado, mantener modo lectura/contención y escalar; nunca recuperar a ciegas.

**Cortes de red/crash:** distinguir solicitud no escrita, CAS confirmado pero respuesta perdida y evento pendiente de entrega. Consultar recibos idempotentes antes de repetir; **no reenviar Push por reimportar datos**. Nunca limpiar colas offline locales sin confirmación de persistencia y revisión posterior de duplicados.

## 6. Condiciones de parada obligatoria

Se detiene el proceso ante cualquier discrepancia no explicada de hashes/ETags, conflicto de IDs, permisos de sala no aprobados, sesión antigua con capacidad de escritura, dispositivo offline pendiente no conciliado, ausencia de copia restaurable, regla privada no aplicada, fallo de verificación de integridad tras CAS, inconsistencia de propuesta/regado, duplicados de eventos o Push, o falta de plan reversible tras cambios v3.

## 7. Decisiones pendientes del gestor Backoffice

Confirmar exactamente: **(a)** ámbito por INV de técnicos y regantes, **(b)** supervisor único VIGUERAS, **(c)** guardias/suplencias, **(d)** qué avisos se conservan y por cuánto tiempo, **(e)** si se admite ventana corta de bloqueo de escrituras por INV para corte, **(f)** tratamiento de móviles offline y **(g)** orden de invernaderos piloto. Ninguna está aprobada por este documento.

**Próximo paso §0.235:** preparar un validador `dry-run` sobre **fixtures sintéticos** que calcule manifiestos canónicos, paridad de riego/propuestas/avisos e incidencias, sin conexión de red ni acceso a datos de usuarios. El validador no ejecutará migración ni cambiará reglas.
