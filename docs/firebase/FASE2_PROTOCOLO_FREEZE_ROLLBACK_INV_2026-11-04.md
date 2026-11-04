# APP R v3 — §0.237 · Protocolo sintético de bloqueo por invernadero

**04/11/2026 · Rama `test/v1.0` · Prototipo de pruebas únicamente.** Ningún cambio en datos/reglas reales de Firebase, frontend, API, Worker, DEV, PRD o main.

## Hecho comprobado que impide utilizar un «flag de congelación» en producción

`index.html` guarda directamente en `lasala-riego-v2-<INV>` mediante REST/ETag. Ese escritor **no consulta un registro de bloqueo**. La existencia de `lasala-riego-freeze-demo-v3/<INV>` o de cualquier campo `frozen` **NO BLOQUEA al frontend legado**, ni a pestañas antiguas, móviles desconectados u otros clientes con reglas que sigan permitiendo la escritura.

Las reglas actuales del diseño siguen teniendo `$other.write` autorizado para sesiones con `appUser`; las reglas candidatas que protegen una raíz nueva tampoco revocan automáticamente la escritura sobre los shards antiguos. Un bloqueo real exige sustituir/inhabilitar las rutas de escritura antiguas **en el punto de aplicación de permisos**, y demostrarlo mediante pruebas reales de permisos a los paths exactos (incluida combinación de comodines/reglas heredadas), antes de aceptar un GO.

**Prohibido:** declarar que esta fase ya protege riego v2, basar el corte en un flag del navegador, activar un reloj que «descongele» automáticamente, o mantener dos escritores con autoridad concurrente sobre el mismo INV.

## Modelo de demostración

Se añadió `docs/firebase/prototype-writer-fence-v3.cjs` con una raíz puramente sintética `lasala-riego-freeze-demo-v3/<INV>`. La transición de fase, el contador monotónico `epoch`, los recibos de comandos, la versión y las celdas sintéticas se escriben **en un solo CAS/ETag**. La autorización y pruebas de preparación proceden de callbacks **ficticios** que la futura implementación deberá sustituir por fuentes backend autenticadas.

| Fase | Escrituras admitidas por el escritor de prueba | Transición |
|---|---|---|
| `legacy` | Solo `LEGACY_WRITE` bajo la frontera CAS sintética | `FREEZE` → `freezing` e incrementa epoch |
| `freezing` | Ninguna modificación de riego | `CONFIRM_FROZEN` tras prueba de permisos/estado → `frozen`; vuelta a legacy con rollback seguro |
| `frozen` | Ninguna | `ACTIVATE_V3` tras nueva comprobación de todas las barreras → `v3_active`; vuelta a legacy sin escrituras v3 |
| `v3_active` | Solo `WRITE_V3` con epoch vigente y precondición exacta de celda | `ROLLBACK_HOLD` → `rollback_hold` |
| `rollback_hold` | Ninguna | `RETURN_LEGACY` solo con prueba de replay a v1, paridad y recibos conciliados si hubo escrituras v3 |

Cada comando recibe exclusivamente `invId`, `commandId`, `op` y `expectedEpoch`. El parche de celda se obtiene de un callback de confianza, no de la solicitud. La autorización backend ficticia se reevalúa en **cada intento**. Se bloquean roles no aprobados, escrituras con epoch anterior, cambios concurrentes de la misma celda, comandos duplicados con contenido diferente y modificaciones durante `freezing`, `frozen` o `rollback_hold`. El recibo conserva idempotencia ante pérdida de respuesta tras un CAS confirmado.

**Reglas de transición:** confirmar o activar un corte exige pruebas de bloqueo de rutas antiguas, conciliación de dispositivos offline, ausencia de escrituras en vuelo, ETags recién verificados y copia recuperable. Para restaurar legacy se exige además la preparación del escritor antiguo, con invalidación del epoch anterior; si ya se escribieron datos v3, la reversión necesita constancia expresa de replay/conciliación, paridad del estado y todos los recibos. **Las banderas de prueba no son una certificación real**.

## Pasos obligatorios para un corte real futuro (no ejecutados)

1. Auditar y detener **todos** los caminos de escritura v1/v2 por INV: frontend actual, pestañas y versiones antiguas, accesos REST directos, sesiones offline y cualquier backend. Inventariar los paths exactos y reglas RTDB efectivas, no solo el nombre de las funciones.
2. Diseñar y ensayar un *writer gateway* autorizado para riego/propuestas con JWT vigente, permisos Backoffice y epoch/capacidad verificados. Preparar cambio reversible de reglas para que los clientes ya no puedan escribir directamente los shards originales.
3. Congelar nuevas escrituras, drenar peticiones en vuelo y exigir confirmación autenticada del estado de cada dispositivo/cola offline. Un dispositivo no localizado o desconectado equivale a **NO-GO**.
4. Capturar snapshot/ETags verificables, comparar propuestas/celdas/avisos y generar backup restaurable antes de la primera escritura nueva. Ejecutar pruebas de denegación contra endpoints viejos **con cuentas cliente reales de UAT** y contra endpoints nuevos protegidos.
5. Solo tras aprobación del gestor, activar un único escritor v3 por INV, preservando índice, versionado, relación de propuestas y outbox; monitorizar recibos/reintentos y errores.
6. Para deshacer antes de datos v3, restaurar el enrutamiento original solo después de comprobar que no queda ningún escritor v3 activo. Para deshacer después, **congelar ambos**, reconciliar/reproducir todo comando nuevo con control ETag, verificar paridad y autorizar apertura de legacy con epoch mayor. Nunca hacer rollback «solo cambiando el flag».

## Pruebas y restricciones

`docs/firebase/prototype-writer-fence-v3.test.cjs` ensaya fases, bloqueo de escritores, roles/aprobación simulados, guardias de offline/ETag, CAS concurrentes y pérdida de respuesta, comandos repetidos, INV independientes, cambios de epoch, rollback temprano y posterior, y denegaciones de entrada. Ejecutado con Node.js en GitHub Actions; sin servicios externos.

**Limites:** no existe migración ni bloqueo real, no hay token firmado real, no hay aseguramiento de quorum de dispositivos, no se activan reglas ni API y `verifiedReplayToLegacy` es solo un supuesto del test. `SIMULATED_MATCH`, `serverVerified` o `realtimeFenceEnforced` de estos módulos nunca debe autorizar por sí solo un corte.

**Siguiente bloque §0.238 sugerido:** auditar la matriz efectiva de reglas RTDB para los shards v1/v2 y todas las rutas de escritura, preparar un candidato de reglas y pruebas de revocación de cliente antiguo **solo en emulador** antes de considerar UAT operativa.
