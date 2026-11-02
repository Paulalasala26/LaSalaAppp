# Firebase RTDB TEST — reglas candidatas NO DESPLEGADAS (02/11/2026)

**Estado: borrador de auditoría; NO aplicar desde Firebase Console ni CLI.** Archivo: `docs/firebase/database.rules.test.candidate.phase1.json`. Entorno de referencia: `la-sala-app-test`. Rama `test/v1.0`.

## Alcance
La fase 1 deniega lectura y escritura **directas desde el cliente** en:
- `lasala-admin-audit-v1`: acceso administrativo por API y poda Cron.
- `lasala-config-infra-v1`: gestión de catálogo por API `admin-catalog`.
- `lasala-qc-mediciones-v1`: API `admin-qc-mediciones`.
- `lasala-qc-fotos-sharepoint-v1`: API `qc-fotos-sharepoint`.

Los servicios con credenciales **Admin SDK / servicio privilegiado** pueden seguir accediendo a esos datos; verificar en el entorno real que no están usando la autenticación de un cliente ni están sujetos a reglas RTDB. Se conservan las reglas originales para `lasala-users-v1`, `lasala-roles-v1` y el comodín `$other` **solo para evitar rotura prematura de rutas operativas**.

## LIMITACIÓN CRÍTICA
**Esta fase 1 no resuelve la vulnerabilidad global**: el comodín `$other` sigue permitiendo lectura y escritura directa a usuarios legítimos sobre todos los otros nodos (Riego, Fito, Tareas, Avisos, QC legado, Partidas, etc.). No publicarla como corrección completa ni dar por cerrada la incidencia. Se requiere fase 2 de segmentación por roles, usuario e invernadero, y tratamiento de JSON monolíticos. La lectura de `lasala-roles-v1` sigue expuesta a cualquier sesión appUser y requiere evaluación de privacidad aparte.

## Dependencias estáticas contrastadas
- `api/admin-catalog.js` usa `lasala-config-infra-v1`.
- `api/admin-qc-mediciones.js` usa `lasala-qc-mediciones-v1` y consulta registros de control.
- `api/qc-fotos-sharepoint.js` usa `lasala-qc-fotos-sharepoint-v1` y registros de control.
- La auditoría maestra identifica `lasala-admin-audit-v1` como almacenamiento de servicios administrativos y Cron.

**No se ha demostrado aún** que ningún otro script del navegador lea directamente estos cuatro nodos. Debe verificarse antes de despliegue, junto a flujos de administrador y operaciones offline.

## Plan mínimo de ensayo — responsabilidad del gestor del Backoffice
1. Copia exacta con fecha/versión de las reglas activas de la instancia TEST. Mantener `database.rules.test.json` inalterado y documentar restauración inmediata.
2. Simulador / emulador oficial RTDB: anónimo y cinco roles; los cuatro nodos deben rechazar GET, PUT, PATCH y DELETE con tokens cliente; `users` sigue denegado; `roles` solo lectura autenticada.
3. API ADMIN: listado/edición de salas e invernaderos, lectura auditoría y poda por Cron. Confirmar que las APIs privilegiadas funcionan.
4. API QC: lectura/guardado de mediciones por Túnel y Carga, subida/consulta/borrado autorizado de fotografías y asociación SharePoint. Comprobar CARGADOR solo Carga.
5. Regresión con usuarios reales: navegación Backoffice, Riego, Fito, Partidas, Específicos, Tareas, Avisos, Histórico, Mantenimiento y cola offline/reconexión; comprobar errores y no pérdida de datos.
6. Solo con resultados satisfactorios y **autorización expresa**, planificar publicación escalonada en TEST y rollback. No tocar DEV ni PRD.

**Resultado de esta entrega**: archivo candidato y plan; ningún cambio de reglas activas, datos Firebase, archivos operativos, API o frontend.
