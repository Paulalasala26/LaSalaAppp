# APP R — Tareas: seguimiento pendiente (17/11/2026)

## Aplazado: publicación de reglas Firebase TEST

El código de Tareas y su ruta API están en `test/v1.0`, pero la regla de denegación de escritura directa de `lasala-tareas-v1` todavía no está publicada en Firebase. Queda expresamente aplazada; no publicarla hasta retomar este punto.

Al retomarlo:
1. Guardar una copia de las reglas activas de Firebase TEST.
2. Publicar el contenido versionado de `database.rules.test.json`.
3. Comprobar que la app puede guardar por la API y que una escritura directa autenticada al nodo de Tareas se deniega.
4. Confirmar el rollback disponible.

## Bloque en curso: Integración y concurrencia

Revisar y validar estas interacciones, especialmente con dos usuarios/dispositivos:
- Riego → tareas operativas y conciliación de cambios.
- Plaguicidas/Pistola → creación, ejecución, firma y archivo de la tarea.
- Específicos → tareas de REGANTE.
- Partidas → Específicos vinculados a REGANTE.
- Escrituras simultáneas, ETag, conflictos, reintentos y fallos parciales.

El bloque Offline/sincronización global permanece para después de Integración y concurrencia.

## Hallazgo inicial (17/11/2026)

La primera versión del validador central de Tareas puede rechazar automatismos existentes de Plaguicidas/Pistola y Específicos, porque autoriza solo creación administrativa, ejecución asignada y específicos vinculados a Partidas. Validar y corregir esos circuitos antes de cerrar la protección.