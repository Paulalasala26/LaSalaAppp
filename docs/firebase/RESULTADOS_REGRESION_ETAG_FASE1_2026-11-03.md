# APP R v3 — Regresión de API y concurrencia ETag, Fase 1

**Fecha:** 03/11/2026 · **Rama:** `test/v1.0` · **Ambiente de ensayo:** aislado; sin conexión con Firebase, Vercel ni Microsoft Graph. **NO desplegado.**

## Resultado

**14 pruebas / 14 correctas; 0 errores** en una ejecución JavaScript aislada de los módulos reales obtenidos de GitHub, con sustitutos en memoria de `fetch`, `process`, `Response`, autenticación y librerías de Node que no son necesarias para estas operaciones. Se ejecutó el contenido comprometido en `docs/firebase/regression-phase1-etag.test.cjs`, no solo un modelo reescrito de los flujos.

| Área | Casos ensayados | Correctos |
|---|---|---:|
| Catálogo (`api/admin-users.js` → `updateKey`) | CAS inicial preservando JSON-string, 412 con relectura/fusión, cinco 412→409, cambio nulo sin escritura, ausencia de ETag bloquea PUT | 5/5 |
| Histórico (`api/admin-audit.js` → `pruneExpiredAudit`) | Poda exclusivamente registros caducados; 412 durante DELETE conserva registro | 2/2 |
| QC (`api/admin-qc-mediciones.js`) | Alta schema v6 sin conteo de bandejas, versión duplicada→409, 412→409, falta de ETag→503 sin PUT, CARGADOR no puede modificar Túnel | 5/5 |
| Fotos (`api/qc-fotos-sharepoint.js`) | Escritura deshabilitada→423, ocultación de galería con ETag obsoleto→409 y registro inalterado | 2/2 |

**Validación estática adicional:** 14/14 contratos comprobados entre script de regresión y código original (GET con ETag, cabecera `if-match`, mapeo 412→409, ausencia de ETag, protección de histórico). La sintaxis del test fue validada antes de la ejecución.

## Cómo repetir la suite en Node.js

Desde la raíz de un clon completo de la rama `test/v1.0`:

```bash
node --test docs/firebase/regression-phase1-etag.test.cjs
```

No necesita npm, Firebase CLI, credenciales, base de datos ni Graph. Las API se cargan desde `api/` y `fetch` está sustituido por un servidor lógico en memoria. En este turno la ejecución se realizó mediante un motor JavaScript aislado que proporcionó los equivalentes necesarios para cargar esos módulos, **no mediante el comando Node anterior**, pues la terminal carecía de acceso al repositorio completo.

## Límites y pendientes

1. La ejecución aislada **no garantiza** el resultado de `node --test` en un clon real. Ejecutar dicho comando cuando esté disponible y conservar su salida.
2. **No se ha arrancado el emulador oficial Firebase.** Sigue pendiente la evaluación con sus reglas y tokens sintéticos para confirmar el resultado de autorización.
3. Los endpoints y datos **reales** de TEST no se han tocado. No se han simulado altas completas de Catálogo, ni carga real a SharePoint/Graph, ni recuperación offline/reconexión, ni ETag extremo a extremo a través del servicio real.
4. El gestor del Backoffice debe validar las pantallas y flujos operativos en TEST antes de publicar reglas, conforme a la asignación acordada.
5. El candidato Fase 1 mantiene el comodín `$other` permisivo sobre otros nodos; **no resuelve** la vulnerabilidad global. La publicación de reglas sigue prohibida sin aprobación expresa y plan de rollback.

**Fundamento técnico oficial:** Firebase documenta solicitudes condicionadas con `X-Firebase-ETag: true` e `if-match` y la respuesta HTTP 412 ante conflictos: https://firebase.google.com/docs/reference/rest/database; autenticar REST mediante cuenta de servicio OAuth2 permite operaciones privilegiadas del backend: https://firebase.google.com/docs/database/rest/auth.

**Cambios en la aplicación:** ninguno. Solo nuevo test `docs/firebase/regression-phase1-etag.test.cjs` y este informe. Sin modificaciones a `database.rules.test.json`, reglas activas, APIs, `index.html`, datos, DEV, PRD o `main`.
