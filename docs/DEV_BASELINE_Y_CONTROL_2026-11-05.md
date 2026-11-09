# ViguerAPP — Línea base de DEV y control de cambios

**Fecha de corte:** 5 de noviembre de 2026, 18:14:09 (Europe/Madrid)  
**Rama de trabajo:** `dev/v1.0`  
**Aplicación DEV:** https://la-sala-app-dev.vercel.app

## Punto de partida

La aplicación de DEV parte del estado completo de `test/v1.0` en el commit `44a75bb39e93d61dae3c8968ab21662dd9ea72e6`, incorporado en DEV mediante el commit `f26909faa4936d8b06e5beb986c1ea5e31a18b42`.

El commit de promoción tiene como padres el commit de TEST indicado y el estado previo de DEV `bf081c8212db47b8fc66f854fb0552bba09640ca`. Así queda registrada la unión de historiales y se conserva el trabajo anterior de DEV.

| Referencia | Commit | Uso |
|---|---|---|
| TEST de origen | `44a75bb39e93d61dae3c8968ab21662dd9ea72e6` | Código fuente completo transferido |
| DEV anterior | `bf081c8212db47b8fc66f854fb0552bba09640ca` | Estado anterior, preservado en la copia previa |
| DEV línea base | `f26909faa4936d8b06e5beb986c1ea5e31a18b42` | Punto de partida para el nuevo desarrollo |
| Copia anterior a la promoción | `backup/dev-v1.0-before-test-promotion-2026-11-05` | Recuperación del DEV anterior |
| Copia de la línea base | `backup/dev-v1.0-baseline-2026-11-05` | Recuperación del DEV ya actualizado |

## Qué se transfirió y qué se mantuvo separado

- Se incorporó el árbol completo de TEST a DEV, incluidos los cambios de Control de Calidad, sincronización de datos y fotos, avisos, y alturas uniformes de las cabeceras.
- Se conservaron el tema rojo de DEV y sus documentos de arranque y operación.
- El código de DEV apunta a Firebase `la-sala-app-dev` y usa la configuración web de DEV. Las claves de servicio siguen en la configuración privada de Vercel; no se incluyen en este documento.
- No se copiaron datos de Firebase entre entornos ni se modificaron datos operativos.
- No se modificaron `test/v1.0` ni `main`.
- Se conservó la configuración de Vercel DEV sin el cron que no está habilitado para ese proyecto.
- La integración de SharePoint quedó en el código. Según el registro del entorno DEV, `GRAPH_QC_UPLOAD_ENABLED` y `GRAPH_QC_NEW_LIBRARY_ENABLED` estaban desactivadas; no se cambiaron variables ni permisos de SharePoint. Confirmarlas antes de probar una subida desde DEV.

## Despliegue de la línea base

El proyecto Vercel `la-sala-app-dev` generó el despliegue `dpl_7gZwWQXj2dq8HvoiEazotPGotkqN` para el commit de línea base y quedó en estado **READY**. Se comprobó que la aplicación DEV sirve la versión marcada `20261105-dev-baseline-52`, carga el tema DEV y referencia la base Firebase DEV.

Al compartir repositorio, Vercel también creó una vista previa del commit de registro en el proyecto `la-sala-app-test` con `target=null`. La producción de TEST permaneció en `44a75bb` y READY; esa vista previa no es el dominio operativo de TEST.

La validación anterior confirma publicación y separación de configuración. No constituye una aceptación funcional de escritura, trabajo sin conexión ni carga de fotos a SharePoint.

## Cómo registrar el trabajo desde esta fecha

A partir de esta línea base, los cambios nuevos se desarrollan primero en `dev/v1.0`. Registrar cada unidad de trabajo con un commit identificable y completar una fila:

| Fecha y hora (Madrid) | Commit DEV | Cambio solicitado | Áreas/archivos | Validación en DEV | Promoción DEV → TEST | Commit/fecha TEST |
|---|---|---|---|---|---|---|
| 05/11/2026 18:14 | `f26909f` | Línea base trasladada desde TEST | Aplicación completa; configuración conservada para DEV | Vercel READY; separación Firebase comprobada | No aplica: importación desde TEST | `44a75bb` · commit fuente |
| 07/11/2026 11:57 | `10ced17` | Riego > Abono: categorías y productos nuevos de la versión más actualizada (`main`, 05/11) | Solo `index.html`: `RIEGO_ABONO_TIPOS`, `RIEGO_ABONO_CATEGORIAS`, desplegables de Abono y de abono foliar, y valores por defecto en `opcionesRiegoSelectHTML` cuando el catálogo del Backoffice no tiene el grupo. Backup previo: `backup/dev-v1.0-before-abono-categorias-2026-11-07` (`d5870e6`) | Sintaxis de los 5 scripts inline correcta; simulación aislada 13/13; DEV servía un `index.html` idéntico al del commit. **Validado por el usuario el 09/11/2026** tras prueba manual. Sin verificar estado READY de Vercel para este SHA ni escritura/offline | No promovido | — |
| 09/11/2026 | `14195e7` | Hojas de riego (REGANTE): ver 2 días, hoy y mañana (de `main`, `ab26f02`, 05/11) | Solo `index.html`: `renderRiegoGrid` (`diasQ = [diaRegante-1, diaRegante]`, fuera de la quincena). Corrige además que el REGANTE se quedaba sin ningún día cuando mañana caía en otra quincena. Backup previo: `backup/dev-v1.0-before-regante-2dias-2026-11-09` (`3e63f05`) | Hecho en código. Sintaxis de los 5 scripts inline correcta; simulación aislada 11/11 (el control con el código anterior falla como se espera). **Pendiente:** prueba manual del usuario con un usuario REGANTE; sin prueba funcional real ni verificación READY de Vercel | No promovido | — |

Para cada promoción DEV → TEST:

1. Registrar el commit DEV exacto y resumir el cambio.
2. Revisar el diff y confirmar que no arrastra configuración, claves, datos ni tema exclusivo de DEV.
3. Validar y aceptar el comportamiento en DEV.
4. Promover solo el alcance acordado a `test/v1.0`; guardar el commit TEST resultante y su estado de despliegue en la tabla.
5. Mantener `main` fuera de este flujo salvo autorización separada.

Las ramas no se sincronizan automáticamente. Esta línea base no autoriza promociones futuras por sí sola.
