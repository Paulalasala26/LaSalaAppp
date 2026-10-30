# APP R v3 — Entornos y arranque de DEV (30/10/2026)

## Estado confirmado

| Entorno | Repositorio y rama | Alojamiento | Datos |
|---|---|---|---|
| PRD antiguo | `Paulalasala26/LaSalaAppp`, `main` | Sin retirar; no intervenir | No intervenir |
| TEST operativo | `Paulalasala26/LaSalaAppp`, `test/v1.0` | Proyecto Vercel `la-sala-app-test` · https://la-sala-app-test.vercel.app | Firebase `la-sala-app-test` |
| DEV operativo | `Paulalasala26/LaSalaAppp`, `dev/v1.0` | Proyecto Vercel `la-sala-app-dev` · https://la-sala-app-dev.vercel.app | Firebase `la-sala-app-dev` |

- Proyecto Firebase DEV: `la-sala-app-dev`.
- Realtime Database DEV: `https://la-sala-app-dev-default-rtdb.europe-west1.firebasedatabase.app`.
- Firebase Authentication: Custom Tokens a través de `/api/firebase-auth`; configuración web y API del servidor aisladas a DEV.
- Datos de TEST exportados e importados a DEV por el usuario, confirmación 30/10/2026. Copia puntual: no es sincronización continua.
- Variable privada `FIREBASE_SERVICE_ACCOUNT_JSON` comprobada en Vercel DEV para Production y Preview (sin revelar ni almacenar aquí secretos).
- Proyecto Vercel DEV conectado al repositorio GitHub y Production Branch Tracking apuntando a `dev/v1.0`.
- Despliegue DEV `dpl_7F9KoysE9SpNDTQbZFtXA2GSZsu2` (commit `fc46c6d4702a2e80c4fe1d2562ad98beea58b5f7`) comprobado `READY`.
- Vercel DEV: `GRAPH_QC_UPLOAD_ENABLED=false` y `GRAPH_QC_NEW_LIBRARY_ENABLED=false` (fotos SharePoint no habilitadas). Cron de retención no está en `vercel.json` DEV.
- El usuario ha validado visualmente acceso y consultas de Partidas/invernaderos/ficha, Riego, QC, Específicos, Plaguicidas, Tareas y Backoffice (30/10/2026).

## Límites de la validación

- No se han validado con una prueba integral de aceptación en DEV la creación, edición o eliminación de datos, persistencia entre sesiones, sincronización offline ni fotografías SharePoint.
- Las operaciones de fotos con Graph siguen deshabilitadas deliberadamente; su aislamiento y validación son trabajos separados.
- El clon no se actualiza automáticamente con futuros cambios en `test/v1.0`; comparar las ramas y revisar diferencias antes de incorporar novedades.
- El proyecto Vercel TEST comparte repositorio y puede crear despliegues **Preview** de los commits de `dev/v1.0`. Esos previews **no son** el dominio Production de TEST. No usarlos para UAT operativa y no modificar la configuración TEST sin autorización.
- Toda prueba de escritura debe realizarse **solo en DEV**, con registros de prueba identificables, verificando después persistencia, permisos y ausencia de efectos en TEST.

## Reglas de desarrollo y promoción

1. Nuevas funcionalidades y correcciones exclusivamente en `dev/v1.0` y Vercel `la-sala-app-dev`. Nunca editar `main` ni `test/v1.0` por defecto.
2. Antes de modificar, registrar HEAD, diff, backup recuperable y dependencias. Respeta la guía `docs/PROMPT_NUEVOS_DESARROLLADORES.md`.
3. Despliegue DEV: Production Branch Tracking `dev/v1.0`; Ignored Build Step permite esa rama y omite las demás.
4. Tras validar el cambio, proponer promoción controlada `DEV → TEST → PRD`, solo con autorización expresa para cada entorno. Nunca fusionar ramas o desplegar en un destino ajeno a DEV sin autorización.
5. No copiar credenciales, enlaces de bases de datos ni configuración de Graph entre entornos; conservar los secretos en Vercel.
6. La retirada del PRD antiguo y la promoción de TEST al nuevo PRD siguen pendientes de decisión del usuario. No realizarlas implícitamente.
