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

## Revisión histórica GS y posible conector local obsoleto (10/11/2026)

Se analizó **offline**, sin consultas contra GS ni Firebase, la exportación `gs.zip` de la Biblioteca (19 CSV de GS, copia histórica 15/10/2026), junto con el SELECT de `pilot_gs_qc_preinjerto.py` de `test/v1.0`.

- En `partidas.csv` hay **156.579 partidas**. `PAR_UBIC` está vacío/0 en la totalidad de esa copia: no es una fuente acreditada de calles para Preinjerto.
- Para `PAR_FECS` entre **10 y 15/11/2026** (con el filtro de las cuatro categorías P/WE/C/VE), la copia histórica contiene **20 partidas**, de las cuales **17 tienen `PAR_CAS`**. Ejemplos verificables: `26C02436` → `PAR_CAS=016`; `26C02653` → `PAR_CAS=028`. Hay también etiquetas `Cliente Final` como `INVERNADERO 9` y `INVERNADERO 14` para partidas diferentes con `PAR_CAS=062`; no deben confundirse automáticamente con la localización física actual.
- La extracción local del usuario de 10/11 devuelve 145 partidas y el recuento PowerShell dice 0 `PAR_CAS`. **Ese recuento no distingue campo ausente de campo vacío** en objetos JSON. El traceback anterior de `get_mysql_credentials` solicitando obligatoriamente `keyring` tampoco coincide con la versión ya disponible en GitHub, que incorpora fallback de credenciales: indicio fuerte de **script local antiguo**.
- `p-extension.csv` almacena ubicaciones de movimientos: `PEX_NPA` relaciona la partida y `PEX_IDE`, `PEX_SDE`, `PEX_FDE` representan destino y rango. En la muestra histórica, los **20** registros de Preinjerto previstos 10–15/11 no tienen extensiones/tratamientos/injertos asociados. En partidas de Preinjerto 2026 con movimientos, casi todos los registros de extensión son **posteriores** a `PAR_FECS`, así que no se puede retroproyectar la calle como si estuviera asignada en el momento del QC.
- El script de Preinjerto de GitHub ahora comprueba que existan las columnas `PAR_CAS`, `PAR_UBIC` y `Cliente Final` en la extracción, contabiliza su cobertura y muestra un aviso si `PAR_CAS` llega sin valores. Commit correctivo final `c4c19a350e4c34c60bba251fa87bf333713562d2`.

**Diagnóstico siguiente sin tocar datos:** verificar en el JSON local si `PAR_CAS` y `PAR_UBIC` aparecen *como propiedades* de `26C02436`; después sustituir el script local por el de GitHub y repetir una extracción GS read-only del mismo período para comprobar si vuelve el código `016`. No sincronizar Preinjerto con Firebase hasta resolver discrepancia. No desplegar Vercel.

## Investigación sobre ubicación de Preinjerto: contraste export GS histórico

Se ha contrastado el export estático `gs.zip` (19 CSV de GS, corte histórico anterior) con la extracción local actual del 10–15/11/2026. No se ha accedido a MySQL en directo.

**Hallazgos comprobados en los CSV:**

- La tabla `partidas` contiene `PAR_CAS` y `PAR_UBIC`. Para partidas `26P*/26WE*/26C*/26VE*` con `PAR_FECS` del 10 al 15 de noviembre, el corte histórico contiene **20 partidas**, de las cuales **17 tienen `PAR_CAS`** y **ninguna `PAR_UBIC`**. En la extracción en vivo posterior del usuario hay **145 partidas**, **0 con `PAR_CAS`** y **0 con `PAR_UBIC`**. Son cortes distintos y NO deben mezclarse como si fueran el mismo estado de GS.
- Ejemplos del CSV histórico: `26C02436 → PAR_CAS=016`, `26C02653 → 028`, `26P02545 → 007`, `26C02635 → 062`; este último tiene `PAR_CLF=INVERNADERO 9`. El `PAR_CAS` bruto y la frase `INVERNADERO 9` no deben identificarse entre sí sin evidencia.
- `p-extension` tiene `PEX_NPA` (partida), `PEX_FEC` (fecha del movimiento), `PEX_IDE`, `PEX_SDE`, `PEX_FDE` (destino de ubicación). El corte histórico contiene movimientos para partidas P/C, pero el análisis por fecha muestra que casi todos son **posteriores a `PAR_FECS`** (P: 844 posteriores y 2 mismo día; C: 1634 posteriores y 2 anteriores). Por tanto **no sirve deducir desde el movimiento posterior una calle correspondiente al QC preinjerto inicial**.
- `p-injertos.PIN_LOCA` corresponde al circuito Túnel y `p-carga_pca_par.C3/C4/C5` al de Carga, no a una localización probada de Preinjerto.
- El inventario de esquema mencionado previamente incluye `partidas_par_ubic`, pero su **relación y significado no se han verificado** en las fuentes CSV disponibles; no inventar JOIN ni completar calles desde su nombre.

**Conclusión:** la ausencia actual 0/145 de `PAR_CAS` no permite concluir que GS jamás lo informe; de hecho, el export histórico sí tiene valores para algunas de las mismas partidas. La calle de Preinjerto no queda demostrada ni con `PAR_UBIC` ni con `p-extension` en el momento de siembra. Antes de modificar el conector, comparar un mismo ID entre instantáneas y verificar un origen real de calle con su fecha efectiva. No se ejecutaron consultas ni escrituras en GS/Firebase, ni se desplegó Vercel.

## Investigación del volcado GS histórico (10/11/2026)

Fuente inspeccionada **sin consultar GS**: volcado local `gs.zip` con archivos `sala12 partidas.csv` y `sala12 p-extension.csv`, fechados el **15/10/2026** según las marcas del ZIP. No equivale a una fotografía actual de GS. Se coteja con el snapshot real extraído por el usuario el 10/11/2026, que contiene 145 partidas (27 Patrón, 118 Variedad) y cero ubicaciones entre `PAR_CAS`, `PAR_UBIC` y `Cliente Final`.

**Hallazgos:**

1. En `partidas.csv` del 15/10 hay registros futuros concretos con `PAR_CAS` rellenado: `26C02436 → 016`; `26C02653 → 028`. Esas partidas figuran entre las 15 primeras del snapshot actual de Preinjerto, donde `PAR_CAS` está vacío. **Hay una discrepancia entre versiones de datos que debe aclararse antes de asumir que `PAR_CAS` no se usa o que la consulta lo pierde.**
2. El volcado histórico tiene solo **20** partidas con prefijos `26P/26WE/26C/26VE` y `PAR_FECS` del 10 al 15/11 (12 Patrón, 8 Variedad); **17/20** tienen `PAR_CAS` y **0/20** `PAR_UBIC`. Las 145 partidas de la extracción real actual no son equivalentes al subconjunto de octubre, por evolución posterior de la base de datos y/o diferencias en los registros disponibles.
3. `p-extension.csv` contiene una relación `PEX_NPA` (código de partida) con `PEX_FEC` y campos `PEX_IDE`, `PEX_SDE`, `PEX_FDE`, `PEX_CDE` de destino, y `PEX_IOR`, `PEX_SOR`, `PEX_FOR`, `PEX_COR` de origen. Son **candidatos de movimientos/ubicaciones**, no una prueba directa de la ubicación actual antes de la operación. Los 20 registros futuros de la muestra histórica carecían de filas asociadas en `p-extension`.
4. En el conjunto de partidas 2026 del volcado, `p-extension` contiene al menos una fila para **909/1062** partidas Patrón y **1736/1979** Variedad. De las 2690 filas con `PEX_IDE` en el subconjunto examinado, **2686** tienen `PEX_FEC` posterior a `PAR_FECS`; esto apoya que los movimientos suelen registrarse después de la siembra, no necesariamente con la planificación futura.

**Implicación técnica:** no es correcto rellenar automáticamente `PAR_UBIC` a partir de `p-extension`, ni adjudicar la última `PEX_IDE/PEX_SDE` sin analizar el tipo de movimiento, multiplicidad, orden, cantidad y significado de cada columna. Conviene primero resolver por qué `PAR_CAS` pasa de valores históricos no vacíos a vacío en el snapshot reciente para códigos idénticos, y determinar el evento GS que establece ubicación de calle para Preinjerto.

**Estado:** sin cambios en SELECT/importador de Preinjerto y sin nuevos despliegues, consultas GS ni escrituras Firebase por el asistente. Los 145 registros no se han sincronizado en esta fase.


## Validación de discrepancia y Excel Preinjerto (10/11/2026)

El usuario descargó el script actual de `test/v1.0` en el conector local y ejecutó una extracción solo lectura para 10–15/11/2026. Resultado: **145 partidas**, 27 Patrón, 118 Variedad; cobertura `PAR_CAS=100`, `PAR_UBIC=0`, `Cliente_Final_INV=0`. No hubo escritura Firebase.

El JSON previo no contenía como propiedades `PAR_CAS` ni `PAR_UBIC`. El script de rama actual valida que ambas estén presentes antes de serializar; por ello, aquel JSON se produjo con un script anterior o distinto. La nueva extracción confirma para dos IDs que también están en el CSV histórico: `26C02436 → PAR_CAS=016` y `26C02653 → PAR_CAS=028`; en ambos casos `PAR_UBIC` está vacío. En la Excel adjunta, la columna `Tipo de Siembra` da `0026` y `0028`, respectivamente. Son campos separados; no usar esos valores como ubicaciones.

La Excel contiene una tabla de 190 filas y 24 columnas, sin campos explícitos de invernadero/calle ni las columnas `PAR_CAS`/`PAR_UBIC`. Así, la discrepancia del código bruto `PAR_CAS` queda resuelta y la Excel no aporta una fuente de calles. **La fuente real de calles de Preinjerto sigue sin acreditarse.** `partidas_par_ubic` continúa como candidato sin clave ni semántica verificadas. El siguiente avance requiere una inspección GS de solo lectura autorizada de su esquema y, si procede, filas para partidas conocidas; no inferir la calle desde `Tipo de Siembra`, observaciones o movimientos posteriores. Sin sincronización Firebase ni despliegue Vercel.


## Inspección autorizada de `partidas_par_ubic` pendiente de ejecución

Tras confirmar en la extracción actual `PAR_CAS=016/028` para `26C02436/26C02653` y `PAR_UBIC` vacío en ambas, el usuario autorizó inspeccionar en GS solo lectura el esquema de la tabla candidata `partidas_par_ubic` y las filas de esas dos partidas. Se añadió `scripts/inspect_gs_preinjerto_location.py` en `test/v1.0`, commit `1304abe5c6ca2286e70d1c86b8185a7cad912816`. Pendiente ejecutar desde el conector local y analizar su salida antes de cualquier cambio en SELECT/importador. Sin sincronización Firebase ni despliegue.
