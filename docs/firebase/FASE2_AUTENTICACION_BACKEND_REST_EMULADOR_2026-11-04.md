# APP R v3 — Fase 2: autenticación real de backend y Firebase REST en emulador oficial

**Fecha:** 04/11/2026 · **Rama:** `test/v1.0` · **Estado:** pruebas de integración correctas en proyecto ficticio; **NO DESPLEGADO**.

## Entrega realizada

Se ha preparado una integración **aislada**, fuera de `api/`:

- `docs/firebase/prototype-avisos-push-auth-emulator-v2.cjs`: puente hacia el **verificador de JWT real de `api/admin-users.js`**, consulta por servidor de `lasala-roles-v1` / `lasala-users-v1` y almacenamiento REST con ETag en el emulador de RTDB.
- `docs/firebase/firebase-emulator-auth-storage-v2.test.cjs`: 11 pruebas de integración con el **emulador oficial RTDB**, JWT RSA generado en cada ejecución y JWKS de Google **sustituido por respuesta ficticia local**. No invoca Google, producción ni Cloudflare.
- `docs/firebase/package.phase1.json`: comando `test:emulator:auth-storage`.
- `.github/workflows/firebase-security-phase1.yml`: paso de CI que ejecuta el nuevo comando.
- `docs/firebase/prototype-avisos-push-migration-v2.cjs`: corregida la igualdad estructural canónica de documentos JSON, sin depender del orden de propiedades.
- `docs/firebase/prototype-avisos-push-store-v2.test.cjs`: escenario adicional de regresión para documentos reordenados, **29/29**.

### Aislamiento garantizado

1. El puente HTTP solo permite `http://127.0.0.1:9000` con base fija y proyecto/nombre de base `demo-lasala-phase2-alerts` / `demo-lasala-phase2-alerts-default-rtdb`. No admite inyectar otra URL ni permite iniciar con `FIREBASE_SERVICE_ACCOUNT_JSON`.
2. El emulador acepta el token administrativo ficticio `Authorization: Bearer owner` **solo en entorno emulado**. Este mecanismo no se debe portar a producción: allí se necesita OAuth de cuenta de servicio controlada y limitada al proyecto adecuado.
3. La biblioteca de pruebas requiere acceder también al **Emulator Hub en localhost:4400**; la interceptación de `fetch` permite únicamente 9000/4400 y sustituye el endpoint JWKS por una clave RSA generada durante la prueba. Cualquier otro destino se rechaza.
4. Las bases se crean vacías dentro del `firebase emulators:exec` y se destruyen al finalizar; no hay limpieza, envío Push ni lectura de información externa.
5. Los JWT artificiales usan reclamaciones de proyecto y UID con la misma forma que `api/firebase-auth.js`. El código real de verificación criptográfica (`verifyFirebaseIdToken`) comprueba firma, audiencia, emisor, caducidad, `appUser` y UID. La actividad y el rol se leen de nuevo en el emulador, nunca desde el rol incluido en el JWT.

### Resultados oficiales del 04/11/2026

Run: [GitHub Actions 41815214025](https://github.com/Paulalasala26/LaSalaAppp/actions/runs/41815214025) · commit probado `94226f83ef1872bdec2b602afbbc22d6cfcb89e9` · **completed / success**.

| Pruebas | Aprobadas | Fallidas |
|---|---:|---:|
| Matriz estática Firebase | 84 | 0 |
| Contrato API/servicio | 22 | 0 |
| Regresión ETag (mock) | 14 | 0 |
| Autorización Avisos/Push (mock) | 16 | 0 |
| Puerta HMAC Worker (mock) | 19 | 0 |
| Cron de auditoría (mock) | 23 | 0 |
| API Avisos/Push completa (mock) | 31 | 0 |
| Adaptadores REST y migración (mock) | **29** | **0** |
| Firebase RTDB Emulator — Fase 1 | 13 | 0 |
| Firebase RTDB Emulator — Fase 2 | 20 | 0 |
| **JWT existente + backend + REST/ETag + migración en RTDB Emulator** | **11** | **0** |

**Incidencias corregidas durante el ensayo:** la interceptación HTTP de la biblioteca oficial requería admitir localhost:4400; el propietario REST del emulador debía ir en `Authorization` y se usó el PUT condicionado documentado sin `print=silent` para compatibilidad; el migrador marcaba equivocadamente un conflicto cuando Firebase reordenaba campos JSON. Este último caso **sí detectó un defecto del algoritmo de migración**, corregido con comparación recursiva de propiedades ordenadas y test de regresión.

## Límites restantes y condiciones para paso a TEST real

- Es una integración **real con el emulador de RTDB y el verificador JWT existente**, pero la clave pública se simula: **no valida tokens reales contra Google, ni OAuth real contra Firebase TEST**.
- No se ha creado `api/avisos-push.js` ni adaptado `index.html`. Los datos antiguos `v1` continúan operativos bajo reglas permisivas; el prototipo `v2` no les sustituye.
- No existen todavía adaptadores de producción con OAuth, autorizaciones completas por evento, entrega Web Push, registro de dispositivos/logouts, reconciliación continua y paginación del Backoffice.
- **Antes de crear los nuevos nodos `v2` en TEST real**, las reglas que los deniegan deben estar verificadas, aprobadas y publicadas; actualmente son solo un candidato en `docs/firebase/database.rules.test.candidate.phase2-avisos-push.json`.
- Verificar la versión viva del Worker Cloudflare, liberar el endpoint Vercel consolidando el Cron de auditoría, proteger y respaldar los datos, validar con gestor de Backoffice y preparar reversión de código + cron + datos.
- El recordatorio semanal de Tuta del Worker actual sigue independiente; no duplicarlo ni retirarlo hasta tener el nuevo envío validado.
- **No se ha tocado** `api/`, `index.html`, `lib/`, `vercel.json`, reglas Firebase publicadas, datos TEST/DEV/PRD, Worker Cloudflare, `main` ni entorno DEV.

**Siguiente bloque recomendado:** completar los contratos de autorización de todos los eventos que generan avisos y el procedimiento de migración dual v1→v2, con matriz UAT del gestor, antes de implementar la API operativa.
