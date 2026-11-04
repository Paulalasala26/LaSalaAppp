# APP R v3 — §0.238 · Reglas RTDB candidatas de revocación del escritor legado por invernadero

**04/11/2026 · DESIGN + TEST ONLY · Rama `test/v1.0` · Ninguna regla ni dato desplegado.**

## Diagnóstico de los permisos efectivos

Se ha inspeccionado `index.html` y el candidato `docs/firebase/database.rules.test.candidate.phase2-avisos-push.json`. El riego se guarda en `lasala-riego-v2-<INV>` como **JSON serializado dentro de un string RTDB** y sus escrituras ocurren por REST con ETag/If-Match. Los clientes antiguos no consultan el protocolo sintético `§0.237`; las escrituras quedan permitidas por el comodín `$other.write = auth != null && auth.token.appUser != null`, sin comprobar los invernaderos ni las funciones de rol. Un `.write=false` en un hijo **no puede anular** un permiso de escritura ya concedido en su antecesor. Por ello, en el diseño la revocación debe ejecutarse al nivel que **realmente autoriza** la escritura (aquí, el `$other` de primer nivel), no mediante un nuevo `lock` independiente.

Fuentes oficiales: [sintaxis y precedencia de reglas RTDB](https://firebase.google.com/docs/database/security/core-syntax) y [expresiones regulares en reglas RTDB](https://firebase.google.com/docs/database/security/regex).

### Inventario contrastado de rutas heredadas

| Ruta | Uso en frontend | Tratamiento en candidato de prueba |
|---|---|---|
| `lasala-riego-v2-<INV>` | Registro diario por INV como string; CAS REST | Lectura sigue disponible para autenticados; escritura **solo si** registro de servidor `lasala-riego-write-locks-v3/lasala-riego-v2-<INV>` es `open`. Ausente o `frozen` = denegada. |
| `lasala-riego-v2-index` | Índice de invernaderos, CAS propio | Lectura permitida; escritura **denegada globalmente** durante ensayo de corte. |
| `lasala-riego-v1` | Snapshot anterior/rollback, no editor actual | Lectura permitida; escritura denegada. |
| `lasala-riego-sync-v1` | Estado de sincronización por INV | Lectura permitida; escritura denegada globalmente. |
| `lasala-riego-ejecutado-v1` | Registro de ejecución/operativa | Lectura permitida; escritura denegada globalmente. |
| `lasala-propuestas-riego-v1` | Propuestas globales, guardado independiente del riego | Lectura permitida; escritura denegada globalmente. **No admite bloqueo selectivo por INV con el esquema actual.** |
| `lasala-riego-offline-v1` | Cola localStorage del navegador | No es ruta persistida actual en RTDB, pero se reserva el nombre como denegado en reglas candidatas; no equivale a conciliar operaciones offline. |
| `lasala-avisos-usuario-v1`, `lasala-push-subs-v1`, otras rutas sin relación | Notificaciones y demás módulos heredados | Comodín y permisos existentes **sin cambio** en el candidato, con las raíces Phase 1/2 privadas intactas. |
| `lasala-riego-write-locks-v3` | **Nueva raíz de control solo en el emulador** | Prohibida lectura/escritura para todos los clientes, incluido ADMIN; únicamente un backend confiable podría cambiarla. No existen datos ni flujo de gobierno real para esta raíz. |

**Alcance del candidato:** restringe los permisos del escritor **a cualquier sesión que use las mismas reglas de prueba**, incluidas sesiones antiguas, pero no inmoviliza transacciones previas al cambio de reglas ni demuestra que el escritor backend esté listo. Los roles no se han endurecido: el caso `open` reproduce el permiso amplio del sistema legado para evitar una afirmación falsa de autorización fina.

## Archivos incorporados

- `docs/firebase/database.rules.test.candidate.phase2-riego-freeze.json`: **variante separada**, que parte de las reglas candidatas Phase 2 y cambia solo `$other.write` para reconocer la llave de cada shard, cerrar los nombres globales de riego/propuestas y proteger `lasala-riego-write-locks-v3`. Mantiene `$other.read` sin cambios y no sustituye las reglas candidatas anteriores.
- `docs/firebase/firebase.emulator.phase2-riego-freeze.json`: instancia **demo** en `127.0.0.1:9000`.
- `docs/firebase/firebase-emulator-riego-freeze-v3.test.cjs`: batería de **12 pruebas sobre Firebase RTDB Emulator real** con fixtures sintéticos, sin credenciales de Google ni servicios de producción.
- `docs/firebase/package.phase1.json`: script `npm run test:emulator:riego-freeze`, integrado en `.github/workflows/firebase-security-phase1.yml` (sin permisos de escritura ni secretos).

Se han probado los cinco roles con `appUser` y una sesión anónima/sin `appUser`. Se comprobaron: lecturas en estado `open/frozen`, mutaciones permitidas únicamente para `INV_1` inicialmente `open`, denegación en `INV_2` congelado y en INV desconocidos, imposibilidad de manipular los locks desde cliente, denegación global de índice/propuestas/sync/riego ejecutado, rechazo de borrados y escrituras hijas, cambio `open→frozen` por contexto privilegiado del emulador que invalida clientes antiguos, actualización multipath de raíz, preservación del resto de rutas y de las raíces de seguridad Phase 1/2.

## Validación independiente

**GitHub Actions [run 41853435745](https://github.com/Paulalasala26/LaSalaAppp/actions/runs/41853435745)**, commit del código validado `1e35eadc7cb02c6d4dce97952d5285a422492c97`: `completed/success`. Logs del job `126655920373`: **21 suites, 449/449 PASS, 0 FAIL**, incluidos los **12/12** escenarios nuevos del emulador, y todas las pruebas previas de seguridad JWT, ETag, migración y reglas.

**Esto acredita exclusivamente las reglas candidatas y fixtures del emulador.** No acredita nada de permisos o datos de Firebase en funcionamiento. No se ha aplicado un `firebase deploy`, cambiado `index.html`, actualizado un Worker ni escrito Firebase TEST/DEV/PRD.

## Barreras y decisiones antes de usar con usuarios reales

1. **NO DESPLEGAR ESTA VARIANTE TAL CUAL.** Cierra las escrituras de propuestas y del índice de riego para **todos** los INV, incluso cuando un shard permanezca `open`. La UX actual y las colas offline pueden interpretar el `permission_denied` como falta de conexión y reintentar indefinidamente. Se requiere diseño UI y arquitectura de propuestas por ámbito o gateway backend.
2. El flag `open` es una llave **servidor**, pero aquí se ha sembrado sintéticamente sin actor ni auditoría: falta API confiable con JWT, permisos de gestor/roles por INV, aprobación y CAS sobre la transición con protección de carreras.
3. **No hay congelación íntegra de negocio** en una estructura fragmentada: riego, propuestas, problemas, avisos e índice pueden no ser atómicos entre sí. Hay que actualizar el modelo antes de asumir que un lock por shard congela toda una operativa.
4. El backend que reciba la autoridad futura deberá registrar comandos y respetar la revisión/epoch en el **mismo límite de escritura**; el frontend antiguo no debe disponer de un camino alternativo (REST, API heredada, copia antigua, identidad privilegiada).
5. Hacer inventario de todas las llamadas REST/storage y sesiones en vivo, verificar reglas desplegadas efectivas, presencia de clientes con permisos elevados y actividad offline; probar denegaciones con cuentas autorizadas reales de UAT y restauración, previa aprobación funcional y de seguridad.
6. Preparar rollback dual y reconciliación de v3→v1 si hay escrituras posteriores, sin reabrir v1 por simple cambio de `frozen` a `open`.

**Siguiente paso §0.239 propuesto:** elaborar matriz de rutas/operaciones/roles y un contrato de autorización real de comandos de riego, incluyendo propuestas y errores offline, **aún sin tocar código operativo ni desplegar reglas**.
