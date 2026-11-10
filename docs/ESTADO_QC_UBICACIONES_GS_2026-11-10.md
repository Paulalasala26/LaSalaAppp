# Estado: ubicaciones en los QC de GS

Fecha: 10/11/2026  
Repositorio: [Paulalasala26/LaSalaAppp](https://github.com/Paulalasala26/LaSalaAppp)  
Rama: `test/v1.0`  
Commit de incorporación del conector de Túnel: `635bae1dad05f705e1140bda1524e8c8fc9cbe5f`

## Objetivo

Mostrar en las tarjetas QC el invernadero y la calle que GS asigna a cada partida, conservando los datos de origen y sin deducir una ubicación a partir de notas u observaciones. Este trabajo se hace en código fuente y en el conector local. No requiere desplegar en Vercel para preparar los cambios.

## Cambios ya subidos a GitHub

- [`scripts/gs_qc_import.py`](../scripts/gs_qc_import.py) — el importador asigna al QC de Túnel `PAR_CAS` y `PIN_LOCA` cuando llegan en el snapshot. Para Preinjerto procesa `PAR_CAS` y `PAR_UBIC`; si `Cliente Final` contiene exactamente `INVERNADERO <código>`, utiliza ese código. Una ubicación GS entrante completa campos vacíos, pero conserva valores de ubicación ya asignados.
- [`scripts/pilot_gs_qc_preinjerto.py`](../scripts/pilot_gs_qc_preinjerto.py) — la consulta añade `PAR_CAS` y `PAR_UBIC` al snapshot, además de las columnas que ya alimentan la Excel.

Los archivos se subieron en dos commits a esta rama: `a731224105e32abc63f07baafdfc23fb6704add1` y `89b9a2e9c75464f1212272efaec44f661c65c7fd`.

- [`scripts/pilot_gs_qc_tunel.py`](../scripts/pilot_gs_qc_tunel.py) — incorporado desde el conector local. Su SELECT devuelve `pa.PAR_CAS AS PAR_CAS` y `pi.PIN_LOCA AS PIN_LOCA`, filtrando por `pi.PIN_FECP = %s`. Mantiene el campo legado `invernaderos_gs` por compatibilidad; este último refleja `PIN_LOCA` y no constituye una resolución del nombre del invernadero.

La interfaz en la rama ya lee `invId`, `calleDesde`/`calleHasta`, `PAR_CAS` y `PIN_LOCA` para la ubicación. No se modificó ni desplegó Vercel. No se ejecutaron consultas ni escrituras sobre GS o Firebase en este trabajo.

## Situación por QC

| QC | Estado |
|---|---|
| Carga normal | El conector recoge `C3/C4/C5` del detalle de carga y genera la ubicación combinada. El usuario indicó que este QC sí la muestra. |
| Carga Injerto | El script existente recoge `C3/C4/C5` y los lleva a `invId` y calles. Revisar la tarjeta después de actualizar la rama/app. |
| Preinjerto Patrón/Variedad | La consulta y el importador ya conservan `PAR_CAS` y `PAR_UBIC`. Hay que sustituir los archivos en el conector local y volver a sincronizar para actualizar los registros de TEST. `PAR_UBIC=0` se considera sin calle. `PAR_CAS` se conserva como código; no se ha confirmado una resolución fiable a nombre en `invernaderos`. |
| Túnel | El SELECT del conector ya incluye `PAR_CAS` y `PIN_LOCA`, y el script está disponible en `scripts/pilot_gs_qc_tunel.py`. Pendiente copiarlo al equipo local y verificar mediante una ejecución autorizada que los datos reales llegan al JSON e importador. |

## Evidencia de la consulta de Túnel

Para la partida `26X02342`, los datos aportados en el chat identifican `PAR_CAS=064`. En `p-injertos`, la línea con `PIN_FECP=2026-11-09` tiene `PIN_LOCA=27` y 37 bandejas. Hay otra línea de la misma partida para `PIN_FECP=2026-11-11`, con 6 bandejas y `PIN_LOCA=30`. La extracción debe relacionar cada QC con su fecha `PIN_FECP`; no debe mezclar las dos ubicaciones. El nombre descriptivo del invernadero para el código 064 sigue sin estar resuelto.

## Próximos pasos operativos

1. Copiar al conector Windows el nuevo `pilot_gs_qc_tunel.py` y los importadores pertinentes desde `test/v1.0`.
2. En una sesión autorizada, ejecutar la extracción/sincronización TEST para las fechas necesarias y validar los campos del JSON.
3. Confirmar en el QC de Túnel de la partida `26X02342` que el registro de `PIN_FECP=2026-11-09` mantiene 37 bandejas, `PAR_CAS=064` y `PIN_LOCA=27`, y el de `2026-11-11` mantiene 6 bandejas y `PIN_LOCA=30`.
4. Resolver por separado la denominación del invernadero correspondiente a `PAR_CAS=064`; no inferirla desde observaciones ni desde el campo legado `invernaderos_gs`.

## Validación realizada

En la sesión previa, los tres archivos Python locales modificados compilaron con `py_compile`. En la continuación del 10/11/2026, el conector de Túnel pasó validación sintáctica mediante `ast.parse`; un ensayo local con registros simulados preservó 37 bandejas y calle 27 para el 09/11, y 6 bandejas y calle 30 para el 11/11, con `PAR_CAS=064` en ambos casos. No se ejecutaron consultas ni escrituras en GS/Firebase, ni despliegues Vercel. La comprobación con registros reales sigue pendiente.
