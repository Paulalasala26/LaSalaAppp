# Firebase Fase 1 — dependencias del navegador y estado de pruebas (02/11/2026)

**Candidato NO DESPLEGADO.** No se ha modificado la base de datos, la configuración activa de reglas, `database.rules.test.json`, el frontend operativo ni las APIs.

## Verificación directa en GitHub, rama test/v1.0

- `admin/catalog.js` utiliza `/api/admin-catalog`, no contiene referencia literal a las cuatro claves restringidas.
- `admin/qc-dashboard.js` utiliza `/api/admin-qc-dashboard`; sin referencia literal a esas cuatro claves.
- `admin/qc-ficha.js` utiliza `/api/admin-qc-mediciones` y `/api/qc-fotos-galeria`. Además lee directamente un shard `lasala-control-items-v2-...` desde RTDB. **No bloquear ese shard en fase 1**; necesitará segregación por rol/origen en fase 2.
- `api/admin-audit.js` usa `lasala-admin-audit-v1` por credenciales de servicio.
- `api/admin-catalog.js` usa `lasala-config-infra-v1` por helpers de servicio.
- `api/admin-qc-mediciones.js` usa `lasala-qc-mediciones-v1` por credenciales de servicio, con lectura de control-items para verificar origen.
- `api/qc-fotos-sharepoint.js` usa `lasala-qc-fotos-sharepoint-v1` por credenciales de servicio y también lee control-items.

**Alcance limitado:** el conector GitHub devolvió contenido vacío para `index.html` al solicitarlo, incluso por tramo. No constituye evidencia de inexistencia de accesos. Otros módulos del cliente siguen sin inspección exhaustiva. Añadido `docs/firebase/scan-phase1-client-access.cjs` para recorrer `index.html`, `admin/` y `assets/` al ejecutar localmente sobre un clon completo. El script busca **referencias literales** a las cuatro claves; incluso con cero resultados NO detecta claves construidas dinámicamente y precisa revisión manual complementaria.

## Ejecución pendiente

1. Clonar `test/v1.0` en un equipo con acceso a GitHub y ejecutar `node docs/firebase/check-candidate-phase1.cjs` y `node docs/firebase/scan-phase1-client-access.cjs`.
2. Analizar cada coincidencia y revisar expresiones dinámicas de `window.storage` y URLs RTDB.
3. Preparar emulador oficial Realtime Database con instancia aislada y JSON candidato (no sobre TEST). Probar anónimo + los cinco roles con claims `appUser` sobre GET, PUT, PATCH y DELETE de las cuatro claves. Probar nodos operativos y denegaciones de Usuarios/Roles; no utilizar datos reales.
4. Ejecutar regresión de flujo por el gestor Backoffice, incluida reconexión offline, ETag y fotos.
5. Solo tras validación técnica y autorización expresa, decidir publicación limitada TEST y disponer de copia exacta/reversión.

**No se ha ejecutado el emulador oficial**: en este entorno no está instalada la CLI Firebase ni está disponible un clon completo del repositorio; la salida de `index.html` no ha podido inspeccionarse con fiabilidad. **No afirmar que las reglas candidatas estén listas para publicar.** El comodín abierto permanece en la propuesta y la vulnerabilidad general sigue pendiente.
