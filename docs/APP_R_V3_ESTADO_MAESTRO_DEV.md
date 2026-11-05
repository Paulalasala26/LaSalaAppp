# APP R v3 — Anexo maestro DEV
**Última actualización:** 02/11/2026 (España)
**Rama exclusiva:** `dev/v1.0` · **Estado:** cambios visuales validados por el usuario

> Anexo de continuidad de `docs/APP_R_V3_ESTADO_MAESTRO.md` para los cambios realizados exclusivamente en DEV. Leer ambos: la memoria maestra general conserva todo el histórico, y este anexo añade los hitos exclusivos de DEV sin reescribir ni recortar ese histórico.

## DEV — Identidad visual diferenciada — VALIDADO 02/11/2026

**Objetivo:** diferenciar inmediatamente DEV de TEST/PRD mediante un rojo teja/granate suave, legible y no estridente, sin cambios de lógica, estado, modelos ni datos.

- `assets/dev-theme.css` creado como hoja de estilos exclusiva de DEV con variables `--dev-rojo: #985458`, `--dev-rojo-oscuro: #87454a`, `--dev-rojo-claro: #f4e7e7` y degradado suave.
- Login: fondo rojo teja desaturado, botón y detalles de formulario; tarjeta blanca y texto legible.
- Cabeceras principales de aplicación, QC, Backoffice y páginas offline: mismo tema con texto blanco donde corresponda.
- Corrección posterior solicitada por el usuario: cabeceras dinámicas de **Partidas** (selector inicial, mapa, ficha) y **Control de Riego** no se habían teñido porque estaban generadas con CSS inline. Se añadieron reglas CSS de mayor prioridad y selectores acotados a los overlays, sin modificar JavaScript ni funcionamiento de sus controles.
- La ficha de Partidas y su cabecera de acciones se incluyen en la corrección; no se recolorean las celdas del grid ni los estados funcionales.
- **Aceptación del usuario:** «ok» tras comprobar el último despliegue (02/11/2026).
- Código: commit inicial `51ab905b1b85fff8c0bcb97f2b7bc7f12764eef2`; corrección final `eb136888c44b2b44c6ac86e69261358a1b800a76`.
- Vercel DEV: `https://la-sala-app-dev.vercel.app`, último commit visual verificado como `READY`.
- `test/v1.0` y `main` **no modificados**.

## Guardarraíles

1. En adelante, modificar solo `dev/v1.0` salvo autorización explícita y separada para promoción DEV → TEST → PRD.
2. Mantener `index.html` como shell: tema visual en hoja externa, sin ampliar HTML con funcionalidades.
3. No convertir la aceptación visual en aceptación de edición de datos, sincronización offline, fotografías SharePoint o procesos automáticos. Esas validaciones permanecen pendientes.
4. Mantener las claves Firebase, los datos, permisos, y variables de entorno aislados de TEST.
5. Si aparecen cabeceras nuevas con estilos inline, adaptar los selectores en `assets/dev-theme.css` de forma precisa; evitar selectores genéricos que recoloreen mensajes de alerta y estados de negocio.
