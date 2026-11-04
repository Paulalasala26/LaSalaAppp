# APP R v3 — §0.239 · Matriz de acceso por usuario, rol, INV, operación y errores offline

**04/11/2026 · Rama `test/v1.0` · Diseño y prototipo aislados.** No se han instalado reglas reales, modificado `index.html`, creado endpoints ni cambiado datos de DEV/TEST/PRD. **No existe aprobación funcional de la matriz**.

## 1. Hechos contrastados con el código operativo

- `index.html:729` mantiene una lista de roles de interfaz; `lasala-roles-v1` es la fuente persistida que debe releer el backend. El hash de `lasala-users-v1` es la condición de cuenta activa del prototipo. **No aceptar `role`, `invId`, `target`, `epoch` ni `appUser` declarados por el navegador**: la identidad debe pasar por verificación criptográfica de JWT y comprobar el UID determinista.
- `index.html:1036–1063,14552–14564,15362–15364`: los regantes consultan hojas de su sala y notifican problemas; la edición de cuadrícula corresponde a otro módulo. `REGANTE1` Sala 1, `REGANTE2` Sala 2, `REGANTE3` Salas 3/4/5, **sin fallback a Sala 1**.
- `index.html:15547–15553,19365–19383`: solo TÉCNICO propone el reemplazo de una celda `?`. `index.html:19442–19503`: Vigueras acepta, acepta cambiando texto o rechaza. El módulo real escribe por separado riego/propuesta y puede emitir Push después; la operación transaccional definitiva **no está implementada**.
- `index.html:13564–13730`: la cola offline utiliza `localStorage` con `clave,usuario,invId,dia,calle,base,deseado,guardadoLocalEn` y reintenta al recuperar la conexión; **no contiene certificado de generación `epoch` ni recibo de backend**.
- `index.html:14122–14144,14227–14243`: un `412` significa conflicto ETag y el frontend intenta recargar/fusionar; hoy un error HTTP se agrupa en un `catch` genérico que puede acabar mostrando la operación como pendiente offline. **Un `403/PERMISSION_DENIED` debe bloquear la repetición automática** y conservar la intención para revisión, nunca confundirse con pérdida de red.
- `index.html:20437–20458`: un REGANTE reporta problemas de riego; la resolución por técnico y avisos se manejan en registros de usuario separados. No se presume atomicidad del registro antiguo.

## 2. Matriz **candidata** de comandos futuros

| Operación backend candidata | ADMIN | TÉCNICO | REGANTE | PEÓN / CARGADOR | Requisito específico |
| --- | --- | --- | --- | --- | --- |
| `READ_RIEGO` | Según asignación | Según asignación | Solo sala asignada | No definido / denegado en este contrato | Lectura con cuenta activa y autorización del gestor; permitida durante `frozen` |
| `EDIT_RIEGO`, `DELETE_RIEGO` | Sí | Sí | No | No | INV activo, ámbito autorizado, unidad CAS y generación v3 vigente |
| `CREATE_PROPOSAL` | No en este contrato | Sí | No | No | Celda origen `?` confirmada por servidor y propuesta de origen persistida |
| `ACCEPT_PROPOSAL`, `ACCEPT_PROPOSAL_EDITED`, `REJECT_PROPOSAL` | **Solo VIGUERAS** | No | No | No | Estado `pendiente` confirmado, rol ADMIN + nombre persistido VIGUERAS, escritura de propuesta/agrupación coherente |
| `MARK_LEAVES` | No en este contrato | Sí | No | No | Fuente de marcado real y ámbito vigente |
| `CORRECT_LEAVES` | **Solo VIGUERAS** | No | No | No | Fuente confirmada; no fiarse de un botón de cliente |
| `REPORT_RIEGO_PROBLEM` | No | No | Sí | No | Día/entradas de riego comprobados por backend, propia sala |
| `RESOLVE_RIEGO_PROBLEM` | No | Solo técnico asignado | No | No | Estado abierto y asignación al técnico confirmada por servidor |
| `MARK_RIEGO_EXECUTED` | No | No | Sí | No | Día/entrada real confirmado, sala asignada |
| `LEGACY_DIRECT_WRITE`, `LEGACY_INDEX_WRITE`, `LEGACY_PROPOSALS_GLOBAL_WRITE` | Denegado | Denegado | Denegado | Denegado | El futuro gateway no permite rutas CRUD globales desde cliente |
| `REPLAY_LEGACY_OFFLINE` | Denegado | Denegado | Denegado | Denegado | Se debe convertir/conciliar mediante comando autorizado y recibo backend, no por replay directo |

**«Sí» no significa permiso actualmente vigente.** El diseño exige, además del rol, cuenta activa, catálogo y asignaciones aprobadas por Backoffice, y comprobación por INV del cierre `v3_active` y generación actual. Se han mantenido explícitamente los roles PEÓN y CARGADOR fuera de la política de comandos de riego hasta concretar sus tareas por separado; esto no cambia sus accesos actuales a otros módulos. No autorizar automáticamente a `PAULA` u otro ADMIN a resolver propuestas destinadas a VIGUERAS.

## 3. Contrato de prototipo

`docs/firebase/prototype-riego-command-authorization-v3.cjs` contiene:

- `createDemoRiegoCommandAuthorizer({auth,transport,loadTrustedCommand,loadTrustedFence,approved})`: recibe **solo** `{op,referenceId}` junto a token; se verifica identidad y UID, se releen `lasala-roles-v1`, `lasala-users-v1`, catálogo de INV y asignaciones; se obtiene fuente de comando y epoch/phase de un **backend simulado**, no del navegador.
- Los regantes tienen ámbito máximo fijo por sala y además necesitan asignación aprobada. Ningún INV desconocido/inactivo se acepta. En comandos multi-INV, **todos** deben autorizarse y estar en fase `v3_active`.
- `authorized:true` **no es un permiso de escritura ni una capability**; `serverRevalidationRequiredAtCommit:true` obliga a comprobar rol, cuenta, epoch y la precondición de negocio **en el mismo límite CAS transaccional**. La comprobación previa aislada puede sufrir un cambio de rol o bloqueo justo antes del commit; no abrir permisos RTDB del cliente basándose en el resultado.
- Las marcas `persisted`, `serverVerified`, `enforcedByBackend`, `proposalPersisted` y el catálogo usado en tests son **fixtures**. Todavía NO hay resolutor operativo conectado a un estado de propuesta real ni validación real de escritor. No es una API de producción.

## 4. Decisión obligatoria ante respuesta de escritura

| Respuesta real | Política del futuro cliente/gateway | ¿Reintentar automáticamente? |
| --- | --- | --- |
| HTTP 401 / token expirado | `REAUTH_HOLD`: pedir nueva sesión y reautorizar; mantener cambios locales | No |
| HTTP 403 / `PERMISSION_DENIED` / INV cerrado | `DENIED_HOLD`: indicar falta de permiso/bloqueo, mantener cola en cuarentena, no simular guardado | **No** |
| HTTP 409/412 / ETag/versión | `RECONCILE_HOLD`: recargar, revisar conflicto por celda y permiso; no pisar remoto | No, hasta conciliar |
| HTTP 400/422 / entrada inválida | `INVALID_HOLD`: corrección asistida y cambios locales intactos | No |
| 408/425/429/500/502/503/504 o red agotada | `TRANSIENT_BACKOFF`: conservar local, reintento acotado con nueva comprobación de permisos/epoch | Sí, controlado |
| Error desconocido | `UNKNOWN_HOLD`: investigar, nunca afirmar guardado | No |

Ninguna clase de error devuelve `markSaved:true`; **únicamente el recibo de commit confirmado** podrá limpiar la cola. Específicamente, un `403` de reglas RTDB no justifica marcar «guardado local exitoso» ni reintentar la misma escritura directa cuando la aplicación está congelada. Los registros antiguos de localStorage carecen de epoch, recibo y contexto autorizado, por lo que se clasifican `RECONCILE_LEGACY_OFFLINE`, **sin replay automático**.

## 5. Cobertura y pendientes

Se incorporó `docs/firebase/prototype-riego-command-authorization-v3.test.cjs` y un paso de `.github/workflows/firebase-security-phase1.yml`. Casos: identidad inválida/JWT rechazado, cambio de rol, cuenta desactivada, suplantación de ADMIN, INV desconocido/inactivo, regante fuera de sala, técnico sin asignación, propuesta no pendiente, rechazo por otro ADMIN, bloqueo v3 por INV, multi-INV, errores HTTP y cola offline heredada. Todo sin red, secretos, uso de datos reales ni despliegue.

**Pendientes obligatorios:** aprobación funcional del gestor Backoffice, esquema de fuente y propietario de comandos, vinculación de propuestas con cambios de riego, confirmación de horas/guardias, lector de estado por INV real, aplicación de reglas privadas, gateway JWT y prueba de revocación *entre autorización y CAS*. El tratamiento de los errores debe implementarse explícitamente en el frontend operativo en una fase de desarrollo posterior autorizada. Hasta entonces, este módulo **no cambia el comportamiento actual**.

**Siguiente §0.240 sugerido:** simular revocación de permisos, cambio de epoch y aceptación concurrente de propuestas **entre autorización y commit**, para probar el cierre TOCTOU, sin tocar la aplicación ni Firebase operativos.
