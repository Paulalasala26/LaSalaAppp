# APP R v3 — §0.235 · Dry-run sintético y manifiesto de integridad de migración

**Fecha:** 04/11/2026 · **Rama:** `test/v1.0` · **Ejecución:** exclusivamente fixtures ficticios, sin credenciales ni red, sin lecturas/escrituras Firebase.

## Objetivo y fronteras
Se creó `docs/firebase/prototype-migration-dryrun-v3.cjs` para validar la **compatibilidad estructural y paridad sintética** entre el legado de riego, propuestas y avisos y un candidato normalizado. No es un ejecutor de migración, no se expone como API y no tiene acceso a la base de datos ni al Worker.

- **Origen simulado**: `snapshot.index` = cadena JSON con IDs de INV; `snapshot.shards[INV]` = cadena JSON de cuadrícula día/calle, o `null` cuando falta el nodo; `snapshot.proposals` = array serializado; `snapshot.alerts` = objeto serializado por usuario. Los ETags simulados de índice, shards, propuestas y avisos están en `snapshot.etags`.
- **Destino simulado**: `candidate.irrigationByInv`, `candidate.proposalsById`, `candidate.alertsByUser`, todos objetos JSON. La normalización preserva los valores originales: no convierte formatos de hora, no borra validaciones ni cambios y no reconstruye avisos ausentes.
- `projectLegacy(snapshot)` produce internamente el objeto candidato esperado y detecta problemas. **Solo para tests ficticios**, no reutilizar como script de importación real.
- `dryRunMigration({snapshot,candidate,recheckEtags})` compara por elemento usando serialización canónica independiente del orden de claves, entrega recuentos y hashes SHA-256, incidencias con referencias resumidas en hash y marca `parity='MATCH'|'BLOCKED'`.
- Los ETags de `recheckEtags`, cuando se suministran, tienen que coincidir exactamente; sin una segunda lectura no se puede descartar que otros usuarios hayan escrito después de la captura. Por diseño, incluso con paridad `MATCH`, el resultado siempre incluye `eligibleForCutover=false` y exige conciliación offline y aprobación del Backoffice.

## Incidencias que se detectan
- Índice duplicado, ID inválido, shard faltante o presente fuera del índice, JSON ilegible, contenido inesperado de invernadero, día o calle.
- ETag ausente o distinto tras simulación de relectura.
- Propuesta inválida, ID duplicado, estado fuera de `pendiente/aceptada/rechazada` o referencia a INV no indexado.
- Aviso sin ID, aviso duplicado por destinatario, estructura incorrecta y más de 30 avisos en un mismo bucket. **No se presupone que el legado conserve los avisos históricos eliminados**.
- Diferencia en datos de riego, propuesta o aviso, elemento no migrado, elemento extra en destino y dominio destino con forma inválida. Se compara por contenido completo, no solo por cantidades.

La salida de auditoría no incluye datos de celdas, textos de propuestas, mensajes, nombres de usuario ni IDs originales de incidencias; devuelve hashes de referencias, códigos y recuentos. **No reemplaza un informe autorizado y privado de detalles para corregir anomalías reales**. No se recopila ni publica ninguna credencial, endpoint Push o dato personal de producción.

## Pruebas
`docs/firebase/prototype-migration-dryrun-v3.test.cjs` contiene **29 casos sintéticos**, que incluyen origen/destino idéntico, cambios de orden de claves, estabilidad del hash, concurrencia aparente por ETag, faltantes, huérfanos, duplicados, corrupción de JSON, propuestas/avisos inválidos, diferencias campo a campo y denegación de corte ante una «aprobación» falsa en los argumentos. Se ejecuta como paso aislado en `.github/workflows/firebase-security-phase1.yml`.

## Limitaciones intencionales
1. El simulador **no lee RTDB** y no puede verificar datos verdaderos, ningún invernadero o móvil offline. Los ETags son fixtures, no evidencias del servidor.
2. No prueba la transición de una propuesta y el riego en una única operación ni el destino de eventos reales; eso está pendiente del gestor y de la arquitectura §0.234.
3. No garantiza integridad de históricos borrados, expirados ni de notificaciones Push enviadas tras un guardado fallido en el frontend anterior.
4. La paridad de datos normalizados **no equivale a autorización de corte**. No publicar reglas ni escribir raíces v3 a partir de un `MATCH`.
5. Los planes §0.233–§0.235 deben seguir aislados hasta que existan autorización real de backend, reglas privadas desplegadas, migración reversible validada y UAT funcional.

**Próximo bloque propuesto §0.236:** simulaciones adicionales de **cambios entre snapshot y corte** (versión ETag, múltiples dispositivos offline, solapamiento por invernadero, conservación de cambios de propuestas), sin conectividad real ni escritura en TEST/DEV/PRD.
