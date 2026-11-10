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
