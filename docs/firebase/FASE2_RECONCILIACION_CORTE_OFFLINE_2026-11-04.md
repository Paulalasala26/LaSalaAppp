# APP R v3 — §0.236 · Conciliación de carreras entre snapshot, offline y propuestas (solo simulación)

**04/11/2026 · Rama `test/v1.0` · Alcance: documentación y pruebas con datos sintéticos exclusivamente.**

## Qué se ha implementado
`docs/firebase/prototype-migration-reconciliation-v3.cjs` recibe **únicamente objetos ficticios ya disponibles en memoria**: snapshot original, segunda lectura simulada (latest), candidato normalizado, inventario sintético de dispositivos y diarios offline ficticios, fecha UTC simulada del corte. No contiene cliente Firebase, credenciales, APIs, escrituras ni envío de Push.

El modelo invoca el dry-run §0.235 para analizar diferencias entre la última lectura y el destino, y añade tres análisis independientes:

1. **Carreras en los datos originales**: ETag del índice/shard/propuestas/avisos distinto; celdas de riego nuevas/cambiadas/borradas; propuestas creadas, editadas, eliminadas o con estado distinto; y avisos modificados, leídos o retirados. Incluso si el candidato se actualizó para coincidir con `latest`, un cambio posterior al snapshot obliga a **nueva revisión del corte**, nunca se considera un GO automático.
2. **Enlaces de propuestas a riego**: cambios `pendiente → aceptada` exigen que la **ubicación de prueba** (INV, día, calle/s) sea identificable y el riego final coincida con el texto confirmado; un rechazo exige que la celda de `?` siga sin cambiar. Si la ubicación no se puede reconstruir, la simulación emite `PROPOSAL_LOCATION_UNVERIFIABLE` y bloquea la aprobación. Se marca además cualquier transición regresiva (por ejemplo, `aceptada → pendiente`) o eliminación sospechosa. **Los nombres `dia`, `calle`, `calles`, `textoFinal` se han escogido en fixtures**; antes de construir un reconciliador real deberán contrastarse con las formas exactas de todas las propuestas vigentes.
3. **Inventario/cola offline**: el conjunto de dispositivos esperados debe estar marcado como revisado; cada dispositivo debe entregar su reporte de prueba reciente (15 minutos de tolerancia en el simulador), sin duplicados ni reportes de dispositivos desconocidos. Se bloquean operaciones pendientes, sincronizando o en conflicto; comandos duplicados entre dispositivos, cambios de base con riego remoto, ausencia de celda y **dos comandos diferentes para la misma calle y día**. La simulación requiere recibo de servidor al marcar `acknowledged`, y compara el valor final contra el riego. **Las banderas de confianza y los recibos aquí son datos de prueba: no representan una certificación auténtica del dispositivo ni del backend.**

## Salida y controles
`simulateMigrationReconciliation(...)` devuelve un informe con `status = SIMULATED_MATCH | BLOCKED`, `latestCandidateParity`, recuentos de cambios/operaciones/terminales informados y códigos de anomalía con identificadores **resumidos en hash**. Nunca incluye textos de celdas, nombres de trabajadores, mensajes, IDs de propuesta ni contenido de los diarios; no revela ningún dato original en el informe. La ejecución fija `writes:0`, `pushSent:0`, `hasNetwork:false` y **`eligibleForCutover:false` incluso cuando todo concuerda**, porque solo valida fixtures.

## Casos de prueba
`docs/firebase/prototype-migration-reconciliation-v3.test.cjs` cubre paridad sin cambios, manifiesto estable y no filtración de datos; ETags modificados con/sin diferencias en celdas; actualización de candidato que no borra la carrera; propuestas nuevas, desaparecidas, editadas, aceptadas y rechazadas; aceptación sin riego, edición final, estados ilegales; avisos modificados; inventario inexistente/incompleto, duplicidad, reporte tardío, dispositivos sin información; diarios offline pendientes, confirmaciones sin recibos, solapamientos, conflictos, IDs duplicados, celdas no encontradas, JSON ilegible y negación de `forceCutover` ficticio. Se integra en GitHub Actions con Node.js, sin red.

## Condiciones pendientes para cualquier migración
- Definir las **fuentes fiables** del inventario de dispositivos, las colas locales y los recibos de operaciones realmente guardadas, así como un protocolo de inmovilización de escrituras por INV durante el corte.
- Alinear campos y transiciones de propuestas con el código vivo y verificar en backend los cambios de riego reales, con trazabilidad por autor/revisión.
- Mantener protección previa de reglas privadas y un único escritor autorizado. No usar flags recibidas del navegador como prueba de permiso.
- Ensayar pérdida de respuesta, reintentos, duplicados, latencia, terminal apagado y recuperación con dispositivos reales en UAT **antes** de autorizar ninguna migración.
- Respetar que avisos históricos ya truncados/eliminados **no se pueden reconstruir** con este procedimiento.

**Próximo bloque §0.237 propuesto:** analizar el protocolo de congelación/corte de escritor por invernadero y sus pruebas de bloqueo/reanudación, aún sin tocar el frontend ni Firebase operativo.
