# Estado: ubicaciones en los QC de GS

Fecha: 10/11/2026  
Repositorio: [Paulalasala26/LaSalaAppp](https://github.com/Paulalasala26/LaSalaAppp)  
Rama: `test/v1.0`  
Commit de incorporación del conector de Túnel: `635bae1dad05f705e1140bda1524e8c8fc9cbe5f`  
Corrección de ubicación Túnel: `c1bccebb61fb1283a227478a9b7cba614a76d3eb`

## Objetivo

Mostrar en las tarjetas QC el invernadero y la calle que GS asigna a cada partida, conservando los datos de origen y sin deducir una ubicación a partir de notas u observaciones. Este trabajo se hace en código fuente y en el conector local. No requiere desplegar en Vercel para preparar los cambios.

## Cambios ya subidos a GitHub

- [`scripts/gs_qc_import.py`](../scripts/gs_qc_import.py) — el importador asigna al QC de Túnel `PAR_CAS` y `PIN_LOCA` cuando llegan en el snapshot. Para Preinjerto procesa `PAR_CAS` y `PAR_UBIC`; si `Cliente Final` contiene exactamente `INVERNADERO <código>`, utiliza ese código. Una ubicación GS entrante completa campos vacíos, pero conserva valores de ubicación ya asignados.
- [`scripts/pilot_gs_qc_preinjerto.py`](../scripts/pilot_gs_qc_preinjerto.py) — la consulta añade `PAR_CAS` y `PAR_UBIC` al snapshot, además de las columnas que ya alimentan la Excel.

Los archivos se subieron en dos commits a esta rama: `a731224105e32abc63f07baafdfc23fb6704add1` y `89b9a2e9c75464f1212272efaec44f661c65c7fd`.

- [`scripts/pilot_gs_qc_tunel.py`](../scripts/pilot_gs_qc_tunel.py) — incorporado desde el conector local y corregido en `c1bccebb`. Su SELECT devuelve `pa.PAR_CAS AS PAR_CAS` y `pi.PIN_LOCA AS PIN_LOCA`, filtrando por `pi.PIN_FECP = %s`. Se elimina el campo legado `invernaderos_gs`, que confundía la calle con el invernadero, así como su consulta incorrecta al catálogo `invernaderos`. `PAR_CAS` se conserva como código bruto, sin asignarle una denominación no verificada.

La interfaz en la rama ya lee `invId`, `calleDesde`/`calleHasta`, `PAR_CAS` y `PIN_LOCA` para la ubicación. No se modificó ni desplegó Vercel. No se ejecutaron consultas ni escrituras sobre GS o Firebase en este trabajo.

## Situación por QC

| QC | Estado |
|---|---|
| Carga normal | El conector recoge `C3/C4/C5` del detalle de carga y genera la ubicación combinada. El usuario indicó que este QC sí la muestra. |
| Carga Injerto | El script existente recoge `C3/C4/C5` y los lleva a `invId` y calles. Revisar la tarjeta después de actualizar la rama/app. |
| Preinjerto Patrón/Variedad | La consulta y el importador ya conservan `PAR_CAS` y `PAR_UBIC`. Hay que sustituir los archivos en el conector local y volver a sincronizar para actualizar los registros de TEST. `PAR_UBIC=0` se considera sin calle. `PAR_CAS` se conserva como código; no se ha confirmado una resolución fiable a nombre en `invernaderos`. |
| Túnel | Script corregido en la rama: alias correctos, filtrado por `PIN_FECP` y sin interpretar `PIN_LOCA` como ID de invernadero. Pendiente copiarlo al equipo local y validar con datos reales en una ejecución autorizada. |

## Evidencia de la consulta de Túnel

Para la partida `26X02342`, los datos aportados en el chat identifican `PAR_CAS=064`. En `p-injertos`, la línea con `PIN_FECP=2026-11-09` tiene `PIN_LOCA=27` y 37 bandejas. Hay otra línea de la misma partida para `PIN_FECP=2026-11-11`, con 6 bandejas y `PIN_LOCA=30`. La extracción debe relacionar cada QC con su fecha `PIN_FECP`; no debe mezclar las dos ubicaciones. El nombre descriptivo del invernadero para el código 064 sigue sin estar resuelto.

## Próximos pasos operativos

1. Copiar al conector Windows el nuevo `pilot_gs_qc_tunel.py` y los importadores pertinentes desde `test/v1.0`.
2. En una sesión autorizada, ejecutar la extracción/sincronización TEST para las fechas necesarias y validar los campos del JSON.
3. Confirmar en el QC de Túnel de la partida `26X02342` que el registro de `PIN_FECP=2026-11-09` mantiene 37 bandejas, `PAR_CAS=064` y `PIN_LOCA=27`, y el de `2026-11-11` mantiene 6 bandejas y `PIN_LOCA=30`.
4. Resolver por separado la denominación del invernadero correspondiente a `PAR_CAS=064`; no inferirla desde observaciones ni desde el antiguo campo `invernaderos_gs` (retirado del conector).

## Validación realizada

En la sesión previa, los tres archivos Python locales modificados compilaron con `py_compile`. En la continuación del 10/11/2026, el conector de Túnel pasó validación sintáctica y ensayos con registros simulados. Tras retirar el mapeo erróneo, se ejecutaron `py_compile` y 3 pruebas locales sin conexiones, todas correctas: alias/fecha del SELECT, conservación de 37 bandejas y calle 27 (09/11) y 6 bandejas y calle 30 (11/11) con `PAR_CAS=064`, e independencia de registros por `gs_injerto_id`. No se ejecutaron consultas ni escrituras en GS/Firebase, ni despliegues Vercel. La comprobación con registros reales sigue pendiente.

## Validación real de extracción Túnel (10/11/2026)

El usuario ejecutó localmente `pilot_gs_qc_tunel.py` con `--fecha 2026-11-09` y `--fecha 2026-11-11`, sin `--sync-test`. Se generaron JSON locales con 6 y 8 partes respectivamente; ambas ejecuciones indicaron que no se escribió en Firebase.

| Partida | PIN_FECP | Bandejas | PAR_CAS | PIN_LOCA |
|---|---|---:|---|---:|
| 26X02342 | 2026-11-09 | 37 | 064 | 27 |
| 26X02342 | 2026-11-11 | 6 | 064 | 30 |

Validación de valores realizada inspeccionando ambos archivos JSON con PowerShell. El 09/11 se mostró además un aviso de IDs de invernadero sin ficha en el catálogo: 27, 4, 5, 6; no implica que se haya resuelto el nombre correspondiente a `PAR_CAS=064`.

**Pendiente:** autorización explícita para importación/escritura a Firebase TEST y posterior revisión visual del QC. No se ha desplegado Vercel ni se ha escrito en GS o Firebase por parte del asistente.

## Sincronización Firebase TEST (10/11/2026)

El usuario ejecutó localmente `gs_qc_import.sync_qc_items` para los JSON de Túnel ya validados. Salida comunicada:

- `2026-11-09 (0, 6)`: 0 creados, 6 actualizados.
- `2026-11-11 (8, 0)`: 8 creados, 0 actualizados.

Total: 14 registros procesados en Firebase TEST. No implica todavía verificación visual ni confirmación de que los valores finales se muestren en las tarjetas QC. **Pendiente:** comprobar en APP R TEST la partida `26X02342` en ambas fechas (37 bandejas, `PAR_CAS=064`, calle 27 el 09/11; 6 bandejas, `PAR_CAS=064`, calle 30 el 11/11). Sin despliegue Vercel ni modificaciones en producción.

## Corrección de presentación QC Túnel (10/11/2026)

Tras sincronizar Firebase TEST (09/11: 0 nuevos/6 actualizados; 11/11: 8 nuevos/0 actualizados), el usuario confirmó visualmente que la tarjeta de `26X02342` del 11/11 mostraba 6 bandejas pero `Invernadero: —` y `Calle: —`.

Se revisó `index.html` en `test/v1.0`: `controlQCInfoVisual(c)` solo mostraba `invId` y `calleDesde/calleHasta`; no consultaba `PAR_CAS` ni `PIN_LOCA` directamente. Se añadió lectura alternativa de estos campos (también desde `gsDetalles`) cuando falte una ubicación visual asignada. Si `invId` coincide con `PAR_CAS`, se muestra `Código GS 064` sin inventar denominación de invernadero; se priorizan ubicaciones manuales existentes. La calle `0` permanece sin asignar.

Commit frontend: `211e2f455df3ad4e700c818c1d0965d6600c7fcb`. Pruebas locales aisladas: 09/11→código GS 064/calle 27; 11/11→código GS 064/calle 30; ubicación manual prioritaria; datos GS anidados; ausencia de ubicación.

**Pendientes:** confirmar que `gs_qc_import.py` en el equipo Windows es la versión que alimenta `invId` y `calleDesde` desde `PAR_CAS` y `PIN_LOCA`; comprobar si los registros TEST tienen realmente esos campos en Firebase. El nuevo código de presentación **no está desplegado por el asistente** y no aparecerá en el sitio Vercel hasta que se publique una versión nueva. No se ha tocado producción.

## Incidencia de visualización tras sincronización (10/11/2026)

El usuario comprobó APP R TEST en la tarjeta QC Túnel de `26X02342` para el 11/11. La tarjeta mostraba correctamente **6 bandejas**, pero **Invernadero: —** y **Calle: —**. Se adjuntó captura en la conversación.

La revisión estática de `assets/control-qc-module.js` de `test/v1.0` confirmó que `controlQCInfoVisual(c)` contempla `c.PAR_CAS`, `c.gsDetalles?.PAR_CAS`, `c.PIN_LOCA`, `c.gsDetalles?.PIN_LOCA` y `c.calleDesde/calleHasta`; la tarjeta utiliza esa función para ambos rótulos. No se ha verificado qué versión exacta de ese JS se sirve desde Vercel, ni el contenido final del registro leído por el navegador. Hipótesis pendientes: despliegue/caché obsoleto o lectura de un registro diferente. **No asumir que la sincronización garantiza visualización.** No se ha desplegado Vercel.

Siguiente diagnóstico recomendado: comprobar en navegador la versión efectiva del asset y si el item QC de 11/11 tiene `PAR_CAS=064`, `PIN_LOCA=30`, `invId` y `calleDesde`. No repetir la extracción GS ni importar otra vez sin motivo.

## Regresión sin Vercel (10/11/2026)

Añadido `scripts/test_gs_qc_ubicaciones.py` en `test/v1.0`, commit `e60d3dcc51a2287d20d0dc96662e8fa9f2fcf33c`. Incluye cuatro pruebas unitarias que **no acceden a GS/Firebase**: identidad independiente de las dos fechas de `26X02342` (37 bandejas / calle 27 y 6 bandejas / calle 30), relleno de ubicación vacía sin perder QC/fotos/observaciones, preservación de ubicación manual y calle cero sin asignación. Para ejecutarlas localmente desde la carpeta `scripts`: `python -m unittest -v test_gs_qc_ubicaciones.py`. No se han ejecutado aquí; queda pendiente su resultado.

## Preparación QC Preinjerto sin despliegue (10/11/2026)

Commit `c3664499e7a599c3faf759ec81e52e825243d0ec` en `assets/control-qc-module.js` (`test/v1.0`): el renderizador de ubicaciones distingue Preinjerto Patrón/Variedad del formato de Carga, admite `PAR_UBIC` tanto directo como anidado en `gsDetalles`, conserva prioridad para calles asignadas y muestra `PAR_CAS` como **Código GS** sin inventar denominación. `PAR_UBIC=0` se muestra sin calle. No se ha desplegado Vercel. Se verificó estáticamente la presencia de los nuevos casos, sin prueba en navegador.

**Siguiente prueba operativa pendiente:** extracción local de `pilot_gs_qc_preinjerto.py` en modo solo JSON, con `--desde 2026-11-09 --hasta 2026-11-11` (sin `--sync-test`). Revisar los campos `PAR_CAS`, `PAR_UBIC` y los recuentos de Patrón/Variedad antes de cualquier sincronización de este bloque a Firebase TEST. La autorización previa solo cubrió Túnel de los dos días, no esta nueva carga.

## Ajuste del conector Preinjerto (10/11/2026)

Al intentar la extracción local de Preinjerto para el intervalo `2026-11-10`–`2026-11-15`, la ejecución falló antes de consultar GS por `ModuleNotFoundError: No module named 'keyring'`. Se corrigió `scripts/pilot_gs_qc_preinjerto.py` en `test/v1.0` (commit `9994f376d51b3065da0780f4d99dc26d2f0d4e6c`): se mantiene Windows Credential Manager si está disponible y configurado, pero en su ausencia solicita usuario y contraseña de MySQL en consola (`getpass`), como el conector Túnel. **Pendiente ejecutar el archivo actualizado en el equipo Windows.** No hubo consultas GS, sincronización Firebase ni despliegue Vercel en el intento fallido.

## Resultado real de extracción Preinjerto (10/11/2026)

El usuario ejecutó localmente `python pilot_gs_qc_preinjerto.py --desde 2026-11-10 --hasta 2026-11-15` (solo JSON, sin sincronizar Firebase). Obtuvo 145 partidas: **27 de Patrón y 118 de Variedad**. Snapshot: `snapshots/gs_qc_preinjerto_2026-11-10_2026-11-15.json`.

Se revisaron las 145 filas del JSON con PowerShell; resultado: `Total=145`, `Con_PAR_CAS=0`, `Con_PAR_UBIC=0`, `Cliente_Final_INV=0`. Por tanto, **ninguna de las partidas de esa extracción aporta ubicación con las columnas y patrón de cliente final actualmente admitidos**. El SELECT lee directamente `p.PAR_CAS`, `p.PAR_UBIC` y `p.PAR_CLF` de `sala12.partidas`; esto no permite concluir si otras tablas de GS tienen la ubicación. No deducirla de observaciones.

**Decisión:** no sincronizar este lote únicamente para resolver ubicaciones, ni rellenar códigos de forma artificial. Próximo paso: localizar/confirmar la fuente real de ubicación de Preinjerto (preferentemente con una partida concreta que GS muestre situada) antes de cambiar conector/importador. No se desplegó Vercel.

## Validación Preinjerto GS 10–15/11/2026

Extracción local del usuario con `pilot_gs_qc_preinjerto.py --desde 2026-11-10 --hasta 2026-11-15`: **145 partidas**, de las cuales **27 Patrón** y **118 Variedad**. Snapshot: `snapshots/gs_qc_preinjerto_2026-11-10_2026-11-15.json` (en equipo Windows del usuario). No se escribió en Firebase.

Inspección PowerShell del snapshot: `Con_PAR_CAS=0`, `Con_PAR_UBIC=0` (excluyendo vacío y 0), `Cliente_Final_INV=0` (patrón exacto `INVERNADERO <código>`). Ninguno de los 145 registros trae ubicación aprovechable en estos tres campos. Esto **no prueba** que GS carezca de ubicación en otras tablas; queda por identificar su origen real. No inferirla ni rellenarla desde observaciones. Evitar sincronizaciones repetidas sólo para resolver las ubicaciones. No se ha desplegado Vercel.
