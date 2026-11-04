# APP R v3 — §0.243 · Gateway autenticado de riego con transacciones RTDB reales en emulador

**04/11/2026 · Rama `test/v1.0` · NO DESPLEGADO.** Continuación del ADR G1/G2. La prueba usa un Firebase RTDB Emulator local y un JWT RS256 firmado con claves **ficticias**; no tiene acceso a Firebase TEST/DEV/PRD real ni al Worker.

## Resultado técnico implementado en aislamiento

Se creó `docs/firebase/prototype-riego-gateway-emulator-v3.cjs`, una pasarela de funciones **sin ruta `api/` ni HTTP público**, basada en `makeBackendAuth` / `makeEmulatorTransport` existentes. La verificación JWT utiliza el verificador del repositorio `api/admin-users` y su JWKS simulado por el test; la firma, caducidad, UID y audiencia no dependen de una bandera aportada por navegador.

El agregado protegido `lasala-riego-authority-v3/<INV>` incluye `acl`, `fence/epoch`, `grid`, `proposals`, `commands`, `receipts`, `events` y `outbox`. Tanto la modificación de riego como la transición de propuesta y el alta de outbox se construyen y confirman con **un único CAS/ETag sobre el mismo nodo**. No hay publicación de Push durante la transacción ni doble escritura legacy/v3.

API **solo como interfaz JavaScript de prueba**:
- `commit({token,invId,commandId})`: verifica token, obtiene comando inmutable de un registro sembrado por servidor, comprueba ACL/rol/INV/fase/epoch/origen y aplica riego/propuesta/evento+outbox+recibo en CAS. Reintentos consultan recibo. Una edición de riego **no validado** conserva el cambio pero no genera aviso de supervisor.
- `revoke({token,invId,targetUid,referenceId})`: solo administrador VIGUERAS con capacidad aprobada; revoca al usuario en el **mismo agregado CAS** y avanza el epoch, invalidando órdenes antiguas de ese INV.
- `freeze({token,invId,referenceId})`: solo gestor aprobado; inmoviliza el escritor del INV e incrementa epoch dentro del CAS.
- `getReceipt({token,invId,commandId})`: devuelve únicamente el recibo del autor autenticado y verifica que evento y outbox referenciados existan.

Los clientes **no pueden leer ni escribir** directamente en `lasala-riego-authority-v3`: la denegación se añadió únicamente a `docs/firebase/database.rules.test.candidate.phase2-avisos-push.json`, verificada mediante cuentas de navegador con distintos roles en el RTDB Emulator. El REST backend accede por el contexto privilegiado local del emulador (sin credenciales reales). Se han previsto pruebas de edición validada/no validada, aceptación y rechazo de propuesta, concurrencia de intentos, revocación/freeze, JWT falsificado y carreras de revocación durante el CAS.

## Qué NO se ha resuelto

1. **No existe endpoint HTTP operativo ni gateway de producción.** Los comandos iniciales y grants son datos ficticios sembrados en el emulador; no hay todavía API confiable para emitir intenciones inmutables ni ruta aprobada de Backoffice.
2. La ACL por INV dentro del agregado puede cerrar el TOCTOU **de ese documento**. La baja global de usuarios, el bloqueo instantáneo de múltiples invernaderos y el estado Firebase Auth revocado son sistemas diferentes. En producción habría que verificar en backend el estado de cuenta autenticado y establecer un mecanismo de revocación global con garantía concreta.
3. **Multi-INV no es atómico**. Las operaciones existentes de riego y propuestas que afectan varios INV necesitan coordinador, bloqueo o unidad transaccional común; el ejemplo no permite declararlas integradas.
4. El formato legado de riego es JSON string, las propuestas están en otro array y las incidencias proceden de avisos que pueden borrarse. No se ha migrado ni reescrito ninguna raíz de producción ni solucionado la compatibilidad del frontend.
5. El `Admin SDK` de backend salta las reglas RTDB; por eso la comprobación ACL/epoch debe mantenerse en la capa de negocio y transacción, incluso aunque las reglas candidatas sean privadas.
6. No hay garantía de entrega de Push más allá de que el outbox se inserte en estado pendiente; faltan consumidor idempotente, reintentos, observabilidad, archivo y límites de tamaño.
7. Los permisos y destinatarios de la matriz son candidatos que requieren aprobación del gestor del Backoffice (G1). No se activa migración/corte por haber pasado pruebas.

## Línea QA independiente

Se mantiene íntegra la verificación funcional del usuario sobre el frontend, **más de 2.700 pruebas** en paralelo, sin modificar la interfaz ni sumar esos resultados a los tests de seguridad. Antes de cualquier integración real se cruzarán defectos y evidencias, no recuentos.

## Evidencias automatizadas

Archivos: `docs/firebase/firebase-emulator-riego-gateway-v3.test.cjs`, script `test:emulator:riego-gateway` en `docs/firebase/package.phase1.json` y workflow `.github/workflows/firebase-security-phase1.yml`. El conjunto usa el Firebase Emulator oficial y claves RSA locales con JWKS simulado, sin endpoints externos.

**Criterio GO/NOGO:** resultado verde de emulador = evidencia técnica para un prototipo; **NO-GO** de despliegue hasta aprobación G1, gateway y fuentes reales, reglas efectivas probadas, API auth revocación, migración/rollback y pruebas operativas UAT.

**Siguiente bloque de ingeniería sugerido:** preparar el mecanismo servidor de emisión/validación de intenciones (G2), luego integrar las fuentes reales de roles, ámbito, problemas y propuestas; antes de una migración, aprobar y ensayar el corte de escritor legacy por INV con el gestor.
