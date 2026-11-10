# Continuidad — APP R / conector GS / ubicaciones QC Preinjerto
**Fecha:** 10/11/2026  
**Repositorio:** `Paulalasala26/LaSalaAppp`  
**Rama exclusiva:** `test/v1.0` (`main` y producción intactos)  
**Documento maestro anterior:** [ESTADO_QC_UBICACIONES_GS_2026-11-10.md](./ESTADO_QC_UBICACIONES_GS_2026-11-10.md)

## Objetivo y límites
Conseguir que los 5 QC muestren invernadero y calle procedentes de datos reales de GS, respetando registros, fechas y partidas, sin deducir ubicaciones de observaciones ni inventar nombres de invernadero.

**No desplegar Vercel mientras esté limitado; no realizar escrituras en GS, ni sincronizaciones Firebase adicionales sin autorización específica; no tocar `main` ni PRD.** Seguir investigando offline con código, documentos y volcado histórico. El usuario quiere trabajo directo en GitHub sin volver a investigar lo ya resuelto.

## Estado confirmado: Túnel
- Conector: `scripts/pilot_gs_qc_tunel.py`, enlaza `p-injertos pi` con `partidas pa`; obtiene `pa.PAR_CAS` y `pi.PIN_LOCA`, filtrando por `pi.PIN_FECP`. No interpreta calle como invernadero.
- Caso real `26X02342`: 09/11/2026 = **37 bandejas**, `PAR_CAS=064`, `PIN_LOCA=27`; 11/11/2026 = **6 bandejas**, `PAR_CAS=064`, `PIN_LOCA=30`. Ambas fechas verificadas directamente en los JSON locales tras consultas de solo lectura del usuario.
- El usuario importó los JSON a Firebase TEST: `2026-11-09 (0 creados, 6 actualizados)`; `2026-11-11 (8 creados, 0 actualizados)`, total 14 procesados.
- La tarjeta visible en TEST para 11/11 mostraba 6 bandejas pero `Invernadero: —` y `Calle: —`. Los cambios de presentación están en `test/v1.0`; **la publicación Vercel está limitada y queda pendiente**. No suponer que la app web ya sirve el nuevo JS. Para detalles y commits, leer el documento maestro.
- No resolver todavía la denominación de `PAR_CAS=064`: es un código bruto, no nombre acreditado.

## Preinjerto Patrón y Variedad: extracción real
- Script de GitHub: `scripts/pilot_gs_qc_preinjerto.py`; importador: `scripts/gs_qc_import.py`. La versión **actual** de GitHub admite fallback de contraseña sin `keyring`, incluye `p.PAR_CAS`, `p.PAR_UBIC`, `p.PAR_CLF AS Cliente Final`, verificación de columnas y estadísticas de cobertura. El usuario tuvo antes un error de `keyring` obligatorio: **señal de que quizá aún ejecuta un script local antiguo**.
- Extracción del usuario (sin escritura Firebase): `python pilot_gs_qc_preinjerto.py --desde 2026-11-10 --hasta 2026-11-15`. Salida: **145 partidas**, **27 Patrón** y **118 Variedad**. JSON local Windows: `C:\Users\Usuario\Viguerapp-GS-Connector\snapshots\gs_qc_preinjerto_2026-11-10_2026-11-15.json`.
- Recuento PowerShell del JSON: `Total=145`, `Con_PAR_CAS=0`, `Con_PAR_UBIC=0`, `Cliente_Final_INV=0`. **Advertencia importante:** aquel recuento NO diferencia propiedad JSON ausente de propiedad presente pero vacía. No concluir que GS carece siempre de esas ubicaciones.
- **Los 145 Preinjertos no se han importado a Firebase TEST.** No hacerlo para intentar resolver ubicación hasta aclarar la discrepancia.

## Investigación histórica ya realizada (no repetir)
- Fuente offline: `gs.zip`, copia histórica de 19 CSV GS con marcas 15/10/2026; **no equivale al estado vivo de noviembre**. Véase documento maestro para detalles, recuentos y salvedades.
- `sala12 partidas.csv`: 156.579 partidas; `PAR_UBIC` no ofrece calles útiles en el corte histórico. Para el intervalo 10–15/11 y prefijos P/WE/C/VE hay **20 partidas históricas**, de las que **17** sí tenían `PAR_CAS`. Ejemplos concretos: `26C02436 -> PAR_CAS=016`, `26C02653 -> 028`, `26P02545 -> 007`, `26C02635 -> 062`. Varias aparecen también en el JSON local actual, aparentemente sin código. **No equiparar los 20 del corte antiguo con los 145 de la extracción reciente**.
- `sala12 p-extension.csv`: `PEX_NPA` enlaza partida; `PEX_FEC` fecha del movimiento; `PEX_IDE/PEX_SDE/PEX_FDE` candidatos de destino, con campos de origen relacionados. Muchas extensiones de partidas 2026 ocurrieron **después** de `PAR_FECS`. No deducir de ellas la calle del QC inicial ni crear un JOIN sin validar semántica, fecha y multiplicidad.
- `p-injertos.PIN_LOCA` es del circuito de Túnel; `p-carga_pca_par.C3/C4/C5` es del de Carga, **no son fuentes verificadas de Preinjerto**.
- Posible tabla `partidas_par_ubic` vista en inventario: relación y semántica **no comprobadas**. Revisar solo tras confirmar evidencia, sin inventar claves.
- Excel de QA APP R disponible sirve para requisitos/casos UAT, **no acredita por sí misma ubicaciones reales GS**.

## Paso exacto siguiente
1. **Primero, distinguir propiedad ausente vs. vacía** en el JSON local de `26C02436` y `26C02653`, por ejemplo con PowerShell, sin volver a consultar GS. El análisis previo encontraba 0 pero no discriminaba ambos supuestos.
2. Verificar qué versión de `pilot_gs_qc_preinjerto.py` está instalada en `C:\Users\Usuario\Viguerapp-GS-Connector`; sustituirla por el script actual de GitHub si es antigua. El script nuevo advierte si faltan las columnas y calcula cobertura.
3. Solo tras acordarlo con el usuario, repetir **extracción GS en modo lectura / JSON local exclusivamente** de esas fechas, comprobar `PAR_CAS` en esas dos partidas y contrastar con el volcado del 15/10.
4. Si `PAR_CAS` sigue vacío, investigar si ha cambiado realmente en GS o si el resultado se transforma antes de serializar. Buscar una partida que GS muestre físicamente ubicada en la fecha del QC para validar la fuente **real de calle** antes de plantear nuevo SELECT/JOIN.
5. Una vez acreditada la relación real, corregir script/importador en `test/v1.0`, con pruebas offline, y documentar. No sincronizar Firebase ni desplegar Vercel sin nueva autorización.

## Prompt para nuevo chat
> Seguimos con APP R / conector GS en el repo `Paulalasala26/LaSalaAppp`, exclusivamente rama `test/v1.0`. Lee primero `docs/CONTINUIDAD_QC_GS_PREINJERTO_2026-11-10.md` y el documento maestro `docs/ESTADO_QC_UBICACIONES_GS_2026-11-10.md`. No repitas investigación ya documentada. Túnel ya tiene extracción real validada y 14 registros importados a Firebase TEST; la presentación sigue pendiente de publicación Vercel, ahora limitada. Preinjerto: extrajimos 145 partidas del 10 al 15/11 (27 Patrón, 118 Variedad) pero el JSON local dio 0 `PAR_CAS`, 0 `PAR_UBIC`, 0 `Cliente_Final_INV`; **no se sincronizaron**. En `gs.zip` histórico (15/10) `26C02436` sí tiene `PAR_CAS=016` y `26C02653` `028`. Hay posible divergencia de versión del script local; el PowerShell de conteo tampoco distingue columna ausente y valor vacío. **Siguiente paso concreto:** comprobar propiedad/valor en el JSON y versión del script local; después resolver origen de invernadero/calle de Preinjerto sin inferencias de observaciones ni de movimientos posteriores. Puedes modificar y subir código/documentación a `test/v1.0` con pruebas offline; no tocar `main`/PRD ni desplegar Vercel; no ejecutar consultas o escrituras GS ni sincronizaciones Firebase sin autorización. Responde sintético y con pasos concretos.


## Resultado tras renovar el conector y revisar Excel (10/11/2026)

El usuario sustituyó el script local por `scripts/pilot_gs_qc_preinjerto.py` de `test/v1.0` y repitió la extracción solo lectura del 10–15/11. Resultado: 145 filas (27 Patrón, 118 Variedad), `PAR_CAS=100`, `PAR_UBIC=0`, `Cliente_Final_INV=0`. No se escribió en Firebase.

El snapshot anterior tenía las propiedades `PAR_CAS` y `PAR_UBIC` ausentes. El script actual exige esas propiedades antes de escribir el JSON, por lo que el snapshot antiguo se generó con otra versión del script. En el nuevo snapshot: `26C02436` tiene `PAR_CAS=016`; `26C02653`, `PAR_CAS=028`; ambas con `PAR_UBIC` vacío. Los valores de la Excel en `Tipo de Siembra` son `0026` y `0028`, campos distintos.

La Excel adjunta tiene una tabla de 190 filas y 24 columnas; no contiene columnas explícitas de ubicación, `PAR_CAS` o `PAR_UBIC`. Por tanto, el resultado confirma la recuperación actual del código `PAR_CAS`, pero **no identifica las calles**. No inferirlas de `Tipo de Siembra`, observaciones ni movimientos posteriores. Fuente de calles pendiente de verificar; `partidas_par_ubic` sigue siendo solo una tabla candidata. No consultar GS de nuevo ni sincronizar Firebase sin autorización específica.


## Inspección de tabla candidata autorizada (10/11/2026)

El usuario autorizó inspección GS de solo lectura del esquema `partidas_par_ubic` y de filas asociadas a `26C02436` y `26C02653`. Se añadió `scripts/inspect_gs_preinjerto_location.py` (commit `1304abe5c6ca2286e70d1c86b8185a7cad912816`). El script consulta `information_schema.COLUMNS` y busca únicamente esos dos IDs en columnas de texto candidatas; no escribe en GS/Firebase ni exporta la tabla completa. Pendiente que el usuario lo ejecute localmente y comparta el JSON de salida.


### Ajuste del diagnóstico de `partidas_par_ubic` (10/11/2026)

La primera ejecución confirmó el esquema `id`, `id2`, `C0`–`C5`, pero el lector solo buscó los IDs en `id`; ese resultado vacío no era concluyente porque `C0` es una columna genérica de texto posible. Corregido `scripts/inspect_gs_preinjerto_location.py` en commit `71bf059b947cd0d7d595b68442e1ab4c3202f21d`: ahora busca igualdad exacta de los dos IDs en todas las columnas de texto y devuelve solo filas coincidentes (máximo 20 por columna). Pendiente repetir la ejecución. Sin escrituras.


### Resultado de `partidas_par_ubic` (10/11/2026)

El usuario ejecutó la versión corregida del lector. La tabla existe y tiene `id` varchar (PK), `id2` int (PK), `C0` varchar y `C1`–`C5` decimal; no hay columnas con nombres de ubicación. La igualdad exacta para `26C02436` y `26C02653` no encontró filas en `id` ni `C0`. Esto descarta una relación directa por esos códigos en las columnas de texto consultadas, pero no una relación indirecta mediante `id2` u otra tabla. Pendiente autorización específica para ampliar la búsqueda de metadatos y relaciones. Sin escrituras.
