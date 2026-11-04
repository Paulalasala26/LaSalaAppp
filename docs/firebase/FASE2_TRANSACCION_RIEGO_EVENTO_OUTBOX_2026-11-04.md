# APP R v3 — §0.233 · Operación de riego + origen del evento + outbox en un solo CAS

**04/11/2026 · Solo pruebas aisladas · Ningún despliegue · Estado: integración operativa prohibida**

## Situación comprobada del frontend TEST

- Riego actual: `lasala-riego-v2-<invId>`; `index.html:14076–14300` lee y escribe con ETag sobre **un valor Firebase que es una cadena JSON serializada**, aplica cambios por celdas y reintenta conflictos. No es un objeto RTDB normalizado.
- Índice de invernaderos: `lasala-riego-v2-index`, otro nodo.
- Propuestas: `lasala-propuestas-riego-v1`; se guardan independientemente del riego y se envía aviso en otra operación.
- Avisos usuario: `lasala-avisos-usuario-v1` y Push Worker; actualmente separados del guardado de riego.
- **Consecuencia:** ningún CAS aislado sobre uno de esos nodos ofrece atomicidad entre el riego, la propuesta y el aviso. Una actualización REST multipath sin control de versión no sustituye la protección de conflictos de celda. No cambiar la codificación del riego operativo sin una migración explícita.

## Prototipo de prueba (no reutilizable directamente con los nodos operativos)

`docs/firebase/prototype-business-event-transaction-v2.cjs` usa la raíz **nueva y sintética** `lasala-riego-event-aggregate-demo-v2/<invId>`, privada en las reglas candidatas del emulador. Un documento agrupa `version`, `grid`, `commands` y `events`; cada `events[eventId]` incluye evidencia resumida y `outbox.pending`. Se realiza **una sola** operación `compareAndSwap` (ETag+If-Match) sobre ese mismo documento. La única acción modelada es `riego_validado_modificado` de una celda previamente validada, no las nueve acciones de negocio completas.

- La llamada admite únicamente una referencia de comando. `loadTrustedCommand` y `authorizeTrustedCommand` **deben ser funciones servidor confiables**; aquí son dobles de prueba, no verificaciones operativas del usuario. La firma de permiso incluye aprobación explícita y ámbito del invernadero.
- El comando incorpora `expectedText` y `nextText`, y el servidor comprueba la celda anterior y `revisadoPorVigueras`; si otro cambio ganó, se rechaza en lugar de sobrescribir.
- La misma versión CAS incluye el valor nuevo, `commands[id]` como recibo idempotente y `events[eventId]` con destinatario(s) pendientes. No existe un instante con cambio persistido sin ese evento **dentro del agregado sintético**.
- Reintentos de la misma referencia verifican el fingerprint de comando y obtienen el recibo anterior sin escribir. La misma clave con cambio diferente se rechaza; en conflicto 412 se relee estado y se revalida la precondición.
- En fallo antes de escribir no hay cambio/aviso; ante respuesta perdida después de commit, se lee estado para confirmar si la operación se efectuó. No se envía Push ni se publica al lector de avisos real.

## Barreras que faltan antes de integrar

1. **Arquitectura de datos y convivencia**: seleccionar junto al gestor cómo transformar el riego JSON-string y propuestas del modelo actual a un agregado o una arquitectura transaccional equivalente; proteger la lectura y escritura antiguas. No activar doble escritura sin idempotencia y conciliación.
2. **Validación backend real**: fijar escritor de comandos autenticado con JWT, permisos por invernadero aprobados, fuente de autor/versión/horario confiable y destinatarios derivados del servidor; no confiar en banderas `serverVerified` o `businessApproved` proporcionadas por navegador.
3. **Reglas antes de datos**: aplicar reglas privadas completas a la nueva raíz y verificar acceso REST del servidor; ninguna escritura mientras el wildcard actual permita leer o escribir a clientes.
4. **Generalizar modelo**: estados de propuestas, problemas reportados/resueltos y hojas marcadas/corregidas tienen datos y transiciones independientes. Cada evento requiere una precondición y una unidad transaccional de negocio aprobada; este prototipo solo demuestra un caso.
5. **Entregas**: crear despachador outbox idempotente con reintentos, deduplicación de Push, vista campana, reconciliación y política de conservación. Coordinar Tuta/Cloudflare para no duplicar recordatorios.
6. **UAT/rollback**: probar offline, concurrencia, roles, guardias y paridad exacta de datos por invernadero; plan reversible con captura y validación de fuentes actuales antes de cualquier corte.

**Alcance de las pruebas:** `prototype-business-event-transaction-v2.test.cjs` (crashes, CAS, reintentos, cambios cruzados, permisos) y escenario RTDB Emulator oficial dentro de `firebase-emulator-auth-storage-v2.test.cjs`. Ninguna prueba escribe en Firebase TEST/DEV/PRD reales ni modifica `index.html`, `api/`, `main` o el Worker.
