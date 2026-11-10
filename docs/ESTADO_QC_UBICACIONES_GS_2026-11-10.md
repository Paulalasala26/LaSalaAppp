# Estado: ubicaciones en los QC de GS

Fecha: 10/11/2026  
Repositorio: [Paulalasala26/LaSalaAppp](https://github.com/Paulalasala26/LaSalaAppp)  
Rama: `test/v1.0`  
Último commit conocido: `89b9a2e9c75464f1212272efaec44f661c65c7fd`

## Objetivo

Mostrar en las tarjetas QC el invernadero y la calle que GS asigna a cada partida, conservando los datos de origen y sin deducir una ubicación a partir de notas u observaciones. Este trabajo se hace en código fuente y en el conector local. No requiere desplegar en Vercel para preparar los cambios.

## Cambios ya subidos a GitHub

- [`scripts/gs_qc_import.py`](../scripts/gs_qc_import.py) — el importador asigna al QC de Túnel `PAR_CAS` y `PIN_LOCA` cuando llegan en el snapshot. Para Preinjerto procesa `PAR_CAS` y `PAR_UBIC`; si `Cliente Final` contiene exactamente `INVERNADERO <código>`, utiliza ese código. Una ubicación GS entrante completa campos vacíos, pero conserva valores de ubicación ya asignados.
- [`scripts/pilot_gs_qc_preinjerto.py`](../scripts/pilot_gs_qc_preinjerto.py) — la consulta añade `PAR_CAS` y `PAR_UBIC` al snapshot, además de las columnas que ya alimentan la Excel.

Los archivos se subieron en dos commits a esta rama: `a731224105e32abc63f07baafdfc23fb6704add1` y `89b9a2e9c75464f1212272efaec44f661c65c7fd`.

La interfaz en la rama ya lee `invId`, `calleDesde`/`calleHasta`, `PAR_CAS` y `PIN_LOCA` para la ubicación. No se modificó ni desplegó Vercel. No se ejecutaron consultas ni escrituras sobre GS o Firebase en este trabajo.

## Situación por QC

| QC | Estado |
|---|---|
| Carga normal | El conector recoge `C3/C4/C5` del detalle de carga y genera la ubicación combinada. El usuario indicó que este QC sí la muestra. |
| Carga Injerto | El script existente recoge `C3/C4/C5` y los lleva a `invId` y calles. Revisar la tarjeta después de actualizar la rama/app. |
| Preinjerto Patrón/Variedad | La consulta y el importador ya conservan `PAR_CAS` y `PAR_UBIC`. Hay que sustituir los archivos en el conector local y volver a sincronizar para actualizar los registros de TEST. `PAR_UBIC=0` se considera sin calle. `PAR_CAS` se conserva como código; no se ha confirmado una resolución fiable a nombre en `invernaderos`. |
| Túnel | El importador está preparado para consumir `PAR_CAS` y `PIN_LOCA`, pero falta modificar la consulta del conector local para incluirlos en el JSON. El archivo `pilot_gs_qc_tunel.py` no está en este repositorio ni en los archivos disponibles en esta sesión. |

## Evidencia de la consulta de Túnel

Para la partida `26X02342`, los datos aportados en el chat identifican `PAR_CAS=064`. En `p-injertos`, la línea con `PIN_FECP=2026-11-09` tiene `PIN_LOCA=27` y 37 bandejas. Hay otra línea de la misma partida para `PIN_FECP=2026-11-11`, con 6 bandejas y `PIN_LOCA=30`. La extracción debe relacionar cada QC con su fecha `PIN_FECP`; no debe mezclar las dos ubicaciones. El nombre descriptivo del invernadero para el código 064 sigue sin estar resuelto.

## Siguiente paso para continuar en otro chat

1. Adjuntar el archivo actual `pilot_gs_qc_tunel.py` del conector de Windows (o pegar su consulta SQL).
2. Modificar su SELECT, con los alias reales del archivo, para devolver `PAR_CAS` desde `partidas` y `PIN_LOCA` desde el registro de `p-injertos` correspondiente a `PIN_FECP).
3. Confirmar que ambos campos llegan al JSON y que el importador de Túnel los escribe en el registro QC.
4. Copiar al conector local los dos scripts de esta rama y sincronizar una fecha de Preinjerto para completar las ubicaciones disponibles.
5. Revisar en TEST `26X02342` para 09/11: código 064 y calle 27. Comprobar aparte la fila del 11/11: calle 30.

## Validación realizada

Los tres archivos Python locales modificados compilaron con `py_compile`. No se ejecutaron pruebas funcionales ni sincronizaciones. Vercel no se desplegó.
