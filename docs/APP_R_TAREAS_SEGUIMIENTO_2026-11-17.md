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

## Avance de Integración y concurrencia (17/11/2026)

Se cerraron los cruces detectados en la rama `test/v1.0`:

- Las escrituras de Tareas desde la app pasan por `/api/admin-qc-dashboard?modo=tareas-write`, reutilizando la función existente para respetar el límite Vercel de 12 funciones. El endpoint valida token, usuario activo, rol, ETag y cambio permitido.
- El alta y la edición manual muestran un único responsable. Solo ADMIN/TÉCNICO pueden reasignar tareas pendientes.
- Los automatismos de Pistola no vinculada y Específicos hacen upsert sobre la lista vigente con ETag; no fusionan una copia local completa sobre Firebase.
- El validador permite la fusión acotada de objetivos/horario de Pistola no vinculada y los específicos asignados a REGANTE solo si el invernadero corresponde a su sala. Las tareas Pistola enlazadas conservan su protección.
- Pruebas de política: 8/8 correctas. Despliegue Vercel del commit `e6caa55141dbf1cdd449a82f2abdaab1c6e6f14a`: READY, alias TEST estable asociado; la ruta API responde 405 a GET y declara POST.

**Pendiente expresamente:** publicar las reglas Firebase TEST. Hasta entonces, el flujo de la app usa la API, pero la escritura directa a RTDB todavía no queda bloqueada. No publicar reglas hasta retomar el punto aplazado.

Siguiente bloque de auditoría: Offline/sincronización global.