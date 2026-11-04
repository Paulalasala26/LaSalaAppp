# APP R v3 — §0.240 · Revocación TOCTOU entre autorización y commit (solo simulación)

**Fecha:** 04/11/2026. **Rama:** `test/v1.0`. **Alcance:** código de ejemplo y pruebas sintéticas en `docs/firebase/`; ninguna integración con el frontend, ninguna regla ni dato desplegado.

## 1. Situación y riesgo

La matriz §0.239 verifica JWT, rol, usuario activo, asignación de invernadero y fase/epoch antes de admitir una operación. **Una validación previa no autoriza a realizar el commit más tarde**: durante el intervalo pueden desactivar una cuenta, cambiar el rol, retirar un invernadero, congelar el escritor o resolver una propuesta desde otra sesión (*time of check to time of use*, TOCTOU).

En el sistema actual, los permisos/usuarios, propuestas, riego y avisos viven en raíces diferentes de Firebase RTDB. Un CAS sobre la clave de riego **no es atómico** con un cambio del rol en `lasala-roles-v1` ni con la actualización de `lasala-propuestas-riego-v1`. Releer cada raíz inmediatamente antes de escribir reduce la ventana de carrera, **pero no la elimina** si otro escritor puede modificar esas raíces por separado.

## 2. Qué demuestra el prototipo

`docs/firebase/prototype-riego-toctou-commit-v3.cjs` define **un agregado sintético por INV** `lasala-riego-toctou-demo-v3/<INV>` con identidad/autorización interna (`actors`, asignación, cuenta activa), catálogo, estado/epoch del escritor, datos de celda, propuestas, comandos, recibos y origen/outbox.

`preflight` devuelve solamente una orientación no vinculante (`advisoryOnly=true`). `commit` vuelve a verificar la identidad firmada mediante `auth.verifyIdentity`, relee el agregado, comprueba dentro del mismo estado CAS que:

- el usuario siga habilitado con rol y asignación aprobados;
- el invernadero exista y permanezca autorizado;
- el escritor siga en `v3_active` y el comando tenga el epoch correcto;
- la celda y, en operaciones de propuesta, su estado `pendiente` y texto de origen sigan coincidiendo;
- el destinatario del aviso siga activo.

**Una sola escritura `compareAndSwap`** incorpora el cambio de riego, transición de propuesta, evento y outbox `pending`, más el recibo idempotente. Ante un 412/carrera CAS, se **relee el agregado y se reevalúan permisos y estado** antes de reintentar. Una respuesta perdida tras un commit se reconcilia con el recibo, sin un segundo aviso. Se rechazan comandos heredados, suplantación de actor y referencias manipuladas.

### Restricción de seguridad ineludible

El modelo evita la carrera únicamente porque, en la simulación, las revocaciones de rol, asignaciones, fases y estados de propuesta **modifican el mismo agregado protegido por el mismo CAS** que los comandos. Esto **NO sucede hoy en Firebase real**. No basta con copiar las funciones a una API ni con marcar `serverVerified`: antes de implementar debe elegirse un mecanismo de autoridad única transaccional o un protocolo de invalidación/coordinación que demuestre propiedades equivalentes y que cierre las escrituras directas del cliente.

El prototipo solo modela tres comandos: `EDIT_RIEGO`, `ACCEPT_PROPOSAL` y `REJECT_PROPOSAL`. No modela todavía todos los tipos de cambio ni problemas multi-INV; los ejemplos contienen actores y documentos ficticios. No emite Push, no toca `lasala-riego-v2-<INV>` y no autoriza a activar la pasarela.

## 3. Batería de pruebas y verificación

`docs/firebase/prototype-riego-toctou-commit-v3.test.cjs` usa un almacén de pruebas con versión/CAS y carreras deliberadas. Los escenarios incluyen revocación de rol y cuenta, retirada de ámbito, desactivación de INV, cambio de fase/epoch, propuesta aceptada o rechazada desde otro comando, modificación de texto, bajas de destinatario, pérdida de respuesta y escrituras paralelas. La ejecución forma parte de `.github/workflows/firebase-security-phase1.yml`.

**Integración de QA:** el control funcional del frontend con **más de 2.700 pruebas en curso por separado** se mantiene independiente. No se modifican pantallas ni se duplican sus pruebas. Los hallazgos de este bloque son de backend, concurrencia y seguridad; antes de integración se unificarán los defectos reales de ambas líneas sin sumar sus cifras como si fueran la misma batería.

## 4. Criterios de aceptación para una implementación futura

1. El gestor Backoffice debe aprobar la autorización definitiva y los roles exactos; el almacén de cuentas/INV autorizado no puede cambiar fuera del límite protegido de commit.
2. Reglas privadas deben impedir escrituras directas y lecturas no autorizadas del agregado y sus recibos por cualquier navegador.
3. Cada transición de riego y propuesta necesita un comando verificable, idempotente y ligado a actor, fecha y generación.
4. Revocar una cuenta, cambiar la sala o congelar un INV **antes del commit** debe bloquearlo siempre; cuando una revocación y un commit compiten, su orden de serialización debe ser observable y auditado.
5. El outbox de avisos se publicará únicamente desde registros confirmados, con deduplicación. Una llamada autorizada antes de la revocación **no es un pase permanente**.
6. Antes de UAT se necesitan pruebas reales de JWT/revocación y las operaciones que abarcan varios INV, gestión de offline, compatibilidad del esquema y rollback de datos, además de coordinación con la línea de QA del frontend.

**Siguiente bloque §0.241 propuesto:** revisión de un contrato definitivo de comandos/autoridad para integrar modelos de propuestas, problemas y multi-INV sin depender de banderas sintéticas; priorizar cerrar la arquitectura en bloques amplios, no añadir pruebas de forma indefinida.
