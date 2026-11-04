# APP R v3 — Fase 2: adaptadores REST ETag y migración v1→v2 (simulada)

**Fecha:** 04/11/2026 · **Rama:** `test/v1.0` · **Estado:** prototipo y pruebas, **SIN DESPLIEGUE NI DATOS REALES**.

## Entrega

- `docs/firebase/prototype-avisos-push-store-v2.cjs`: adaptador REST inyectable para datos simulados, **limitado a `http://127.0.0.1:9000/` o localhost y un identificador de proyecto `demo-*`**. No admite direcciones Firebase reales ni otro puerto. Su `fetch` se sustituye en los tests, por lo que no se realiza conexión de red. No autentica a usuarios ni obtiene OAuth; **no es reutilizable directamente en Vercel**.
- `docs/firebase/prototype-avisos-push-migration-v2.cjs`: lector y planificador de snapshots legados, simulación de ejecución en seco, preflight global, inserciones condicionadas `insertIfMissing` y verificación de que los ETags y hashes del origen permanecen idénticos.
- `docs/firebase/prototype-avisos-push-store-v2.test.cjs`: **28 escenarios** con transporte REST simulado (sin Firebase ni credenciales). Se integró en la CI aislada de GitHub Actions.

## Operaciones y garantías implementadas en el prototipo

| Operación | Garantía |
|---|---|
| `retrieve(path,true)` | GET con `X-Firebase-ETag: true`; falla cerrado si no recibe ETag |
| `compareAndSwap` | Relee estado y versión y ejecuta PUT condicionado por `if-match`; HTTP 412 → conflicto sin sobrescritura |
| `insertIfMissing` | Solo inserta si el nodo era `null`; protege la creación frente a otro proceso |
| `compareAndSwapAlert` | Registro individual `/lasala-avisos-v2/<uid>/<id>` con `version+1` y destinatario obligatorio |
| `compareAndSwapSubscription` | Entrada canónica `/lasala-push-endpoints-v2/<sha256(endpoint)>`, con único propietario, versión y CAS |
| `enqueueNotification` | Outbox por clave SHA-256 derivada de tipo+referencia, sin duplicar eventos |
| `enqueueWeeklyReminder` | Reserva atómica del **lote de dos destinatarios** con clave SHA-256 del recordatorio de ese jueves |
| `getAllAlerts` | Lee únicamente el nodo de avisos, nunca credenciales Push; aplica topes de usuarios y registros |
| `getSourceEvent` | Solo con cargador de eventos autorizado inyectado por el backend; no admite consultas libres por defecto |

Referencia oficial Firebase: <https://firebase.google.com/docs/database/rest/save-data#section-conditional-requests>. La documentación confirma GET `X-Firebase-ETag: true`, PUT `if-match`, HTTP 412 en conflictos, y ausencia de reintento automático.

## Migración de datos — diseño real revisado

El formato vigente `lasala-avisos-usuario-v1` es un **JSON serializado como cadena**, cuyo mapa contiene **arrays de avisos por nombre de usuario**; las suscripciones `lasala-push-subs-v1` también son arrays por usuario. Se ha contrastado con el código real `index.html` y `lib/admin-avisos-read.js`. La migración **no trata esos arrays como objetos ya normalizados**.

1. Leer ambos nodos legados con ETag y calcular hash SHA-256 de cada snapshot, sin alterar los datos.
2. Convertir el nombre de usuario normalizado a UID como ya hace `api/firebase-auth.js`; conservar ID, fecha, texto, `visto`, `leido`, evaluación, observaciones, datos del problema y demás campos. Añadir `recipientUid`, `version=1` y procedencia.
3. Para Push, calcular una clave única por SHA-256 de `endpoint`. **Bloquear el plan** si un endpoint aparece en dos usuarios o existe un duplicado con claves diferentes; no reasignar automáticamente.
4. Bloquear el plan ante IDs repetidos, JSON inválido, registros incompletos o ETags ausentes; nunca descartar datos silenciosamente.
5. Ejecutar `dryRun=true` por defecto, con recuentos de creación prevista y **cero PUT**.
6. Para ensayo con escrituras, exigir `approvedForDemo=true`, comprobar que la fuente no ha cambiado, prevalidar **todos** los destinos, e insertar exclusivamente registros ausentes con ETag. Los ya idénticos se omiten (idempotencia). Un conflicto preexistente bloquea todo antes de escribir.
7. Releer al terminar: si el origen v1 cambió mientras se insertaba, **no declarar migración completa**, indicar reconciliación pendiente. **Nunca borrar v1** ni realizar rollback destructivo. Una operación fallida a mitad puede dejar v2 parcialmente poblado; el reintento se basa en inserciones idempotentes y conciliación, no en borrar el trabajo anterior.

**Limitación importante:** `complete:true` en la simulación significa únicamente que el snapshot de v1 permaneció inalterado **durante ese ensayo ficticio**. No indica autorización para cortar escrituras v1 ni éxito de una migración real. En TEST real habrá que fijar una ventana de cambio o un mecanismo de doble escritura/conciliación con checkpoint y respaldo recuperable.

## Controles bloqueantes antes de integrar

- **Publicar de forma autorizada las reglas candidatas privadas de Fase 2 antes de crear cualquier nodo v2 en Firebase real.** Ahora el comodín `$other` sigue permisivo y esos nodos serían accesibles si se creasen sin denegaciones explícitas.
- Implementar transporte servidor auténtico y OAuth con ámbito/proyecto fijo, tokens exclusivamente en backend, roles/cuentas vivos, límites y alertas sin secretos en logs.
- Reconciliar datos reales mediante exportación cifrada/autorizada con hash y recuentos, tratando registros inválidos sin pérdida, y comparar por UID/ID/estado contra el Backoffice.
- Probar el adaptador real en emulador con transacciones concurrentes y autorización de servicio; los 28 tests actuales usan **mock HTTP**, no realizan peticiones reales.
- Adaptar eventos autorizados, entrega Push, observabilidad y cola offline sin romper la campana, el alta/baja por dispositivo ni el Cron semanal Tuta.
- Confirmar versión viva del Worker Cloudflare, consolidar el Cron de auditoría, migrar frontend en etapas y conseguir UAT del gestor del Backoffice.

**No tocado:** `api/`, `lib/`, `index.html`, `vercel.json`, Firebase real, reglas activas, datos, Cloudflare Worker, DEV, PRD ni `main`.
