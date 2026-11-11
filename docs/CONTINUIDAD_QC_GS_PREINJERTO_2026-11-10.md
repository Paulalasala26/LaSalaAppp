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


### Búsqueda ampliada autorizada de fuente de ubicaciones (10/11/2026)

El usuario autorizó inspección de metadatos `information_schema` para tablas/columnas de ubicación y SELECT limitados a las partidas `26C02436` y `26C02653` en tablas candidatas. Se añadió `scripts/inspect_gs_preinjerto_location_sources.py` en commit `3558a09e17e17d5b91d62536c4ed731f57f4ded8`. El script lista esquemas/comentarios de columnas y relaciones FK con `partidas`; luego busca los dos IDs por igualdad exacta en columnas de texto clave de tablas candidatas, con límite de 20 filas por columna. Sin escrituras. Pendiente ejecutar y analizar la salida.


### Resultado de búsqueda ampliada GS (10/11/2026)

El usuario ejecutó `inspect_gs_preinjerto_location_sources.py`. Para las dos partidas, GS devuelve directamente de `partidas` `PAR_CAS=016/028` y `PAR_UBIC=NULL`. La búsqueda exacta no encontró filas en `partidas_par_ubic`, `partidashis_parh_ubic` ni `p-extension.PEX_NPA`; tampoco halló filas con esos IDs en las otras tablas candidatas de ubicación. Las coincidencias fueron `partidas` y tablas no locativas como `partidas_par_cab` (campo `CABEZA`), `partidas_par_esta` y `partidas_par_proc`. La tabla maestra `invernaderos` tiene `id`, `INV_DENO` y parámetros de capacidad, pero no asigna una calle a estas partidas.

**Conclusión operativa:** la extracción actual sí recupera el código `PAR_CAS` (100/145), coincidente con el histórico en los dos casos. Para estas dos partidas GS no devuelve calle en `PAR_UBIC` ni se encontró asignación directa en las tablas hijas revisadas. La fuente real de calle no está acreditada; no es un fallo del serializador ni una ausencia de claves JSON. No añadir calles al SELECT/importador hasta contar con un registro que GS muestre asignado a calle y validar su relación.


## Incidencias retomadas (10/11/2026)

### Ubicación Preinjerto: conclusión tras revisar la app original

En la app original, `26C02436` y `26C02653` aparecen en Check Preinjerto Variedad con el estado «Aún no está en Túnel». La tarjeta Preinjerto omite intencionadamente el campo de invernadero y solo refleja el QC Túnel si ya existe. En GS, la extracción actual conserva `PAR_CAS=016/028` y `PAR_UBIC` vacío. Por tanto, el código bruto de invernadero está disponible; la calle de esas partidas todavía no está asignada en Preinjerto. No seguir buscando la calle en tablas ni derivarla: consultar el QC Túnel por su fecha cuando la partida entre allí; el conector de Túnel toma `PAR_CAS` y `PIN_LOCA`.

### Incidencia: «No se ha podido cargar la galería. Reabre la inspección.»

La captura corresponde al editor de mediciones QC. Se encontró una incompatibilidad: el formulario `QCOperativo` acepta Túnel, Carga, Carga Injerto y ambos Preinjertos, mientras que el adaptador de fotos y las rutas API solo aceptaban Túnel/Carga. La excepción de tipo se ocultaba detrás del mensaje genérico.

Corrección en `test/v1.0`:
- La validación de referencias de fotos ya admite los cinco tipos QC.
- Carga Injerto usa la carpeta existente «20 - Carga»; Preinjerto Patrón y Variedad se separan en «30 - Preinjerto Patrón» y «40 - Preinjerto Variedad», creadas/reutilizadas por la ruta al subir fotos.
- Se amplió la admisión de tipo en las dos rutas API de galería.

Commits: `d9e841b` (IndexedDB/adaptador), `1addd4c` (referencia del frontend), `4e107ef` (SharePoint/API), `1a04c96` (API de galería). No se desplegó Vercel ni se realizaron escrituras GS/Firebase/SharePoint. Falta que la app use este código y comprobar visualmente que desaparece el error y que carga/sube una foto en cada QC afectado.


## Revisión de edición de líneas QC (10/11/2026)

### Alcance del editor actual

- El editor común `assets/qc-editar-linea-v3.js` solo admite `tunel` y `carga` (Carga normal). En estos tipos se pueden corregir partida, cliente/variedad, bandejas y ubicación.
- Las tarjetas de `carga_injerto`, `preinjerto_patron` y `preinjerto_variedad` no exponen esa acción de edición; sus fichas y datos tienen contratos distintos. No deben enviarse al editor genérico de Túnel/Carga.
- Por eso hay líneas que no se editan aunque sean de hoy o futuras: el bloqueo es por tipo/flujo, no por fecha. Las evaluaciones QC se gestionan por su flujo correspondiente.

### Política decidida para fechas

**Sí se pueden corregir líneas QC de días pasados si se mantiene la fecha original del control.** No se permiten altas nuevas en fechas pasadas ni mover una línea existente a una fecha pasada. Las líneas de hoy y futuras se pueden editar en los tipos que tienen editor habilitado. Así se preserva cuándo ocurrió el control, pero se permite corregir sus datos.

El código de Túnel/Carga ya aplica esta regla: `puedeCrearLineaControlQC` y `bloquearAltaPasadaControlQC` impiden altas/movimientos a pasado; `qc107Guardar` permite guardar una corrección cuando el día elegido sigue siendo el día original, aunque sea anterior a hoy.

**Decisión de alcance:** mantener Carga Injerto y ambos Preinjertos sin edición genérica de datos de partida hasta diseñar un editor específico por estadio/fuente. No ocultar esto bajo una restricción de fecha ni alterar campos que vengan de su fuente. Si aparece una corrección urgente de esos QC, tramitarla en la fuente o con un procedimiento administrativo específico.


## Editor específico: QC Carga Injerto (10/11/2026)

Primer bloque implementado en `test/v1.0` (commits `b784820`, `f0f1354`, `7220494`). Cada tarjeta Carga Injerto tiene «Editar partida» para ADMIN, TÉCNICO y CARGADOR. Se pueden corregir partida, cliente, variedad, bandejas y ubicación en ViguerAPP; fecha/hora GS quedan de solo lectura. Las correcciones se guardan como `edicionQC` y el conector las reaplica en sincronizaciones posteriores, sin modificar GS. La regla de fechas se cumple al no permitir cambiar la fecha de origen. No se ha desplegado ni escrito en Firebase.

Pendiente: revisión funcional en TEST cuando se publique/actualice la app. Siguiente bloque por separado: editor de Preinjerto Patrón.


## Editor específico: QC Preinjerto Patrón (10/11/2026)

Segundo bloque en `test/v1.0` (commits `1afbb08`, `43955a2`, `8c25e38`, `c4873d0`). Reutiliza el lápiz existente de la tarjeta y el modal común del editor QC; la edición de códigos GS conserva `PAR_CAS` y `PAR_UBIC` como códigos brutos, sin inferir el nombre del invernadero. Fecha de siembra y entrega quedan bloqueadas. El conector reaplica los campos de `edicionQC` sobre las siguientes importaciones GS. No se desplegó Vercel ni se escribió en GS/Firebase. Revisión funcional en TEST pendiente. Siguiente bloque: Preinjerto Variedad.


## Editor específico: QC Preinjerto Variedad (10/11/2026)

Tercer bloque añadido sobre el flujo compartido de Preinjerto (commits `4a4a480`, `cbb75e5`, `4f9e96f`, `bea807f`). Usa el lápiz y el modal QC existentes; campos, fechas y códigos GS siguen el mismo criterio que Patrón. La persistencia conserva cambios parciales y la cola offline puede reaplicarlos. Con ello quedan preparados los cinco QC: Túnel, Carga normal, Carga Injerto, Preinjerto Patrón y Preinjerto Variedad. Revisión funcional en TEST pendiente; no se desplegó Vercel ni se escribió en GS/Firebase.


## Automatización de recuperación QC en TEST (11/11/2026)

El usuario autorizó automatizar la lectura de GS y la sincronización de Preinjerto y Carga Injerto a Firebase TEST.

- `scripts/sync_gs_qc_test.py` ejecuta ambos pilotos para el rango desde hoy hasta hoy + 5 días. Preinjerto usa `--sync-test --sync-qc-items`; Carga Injerto usa `--sync-test`. Se valida el proyecto Firebase TEST en cada piloto.
- Carga Injerto ya lee MySQL sin interacción mediante Windows Credential Manager (servicio `ViguerappGS`, claves `mysql-user` y `mysql-password`). Si faltan credenciales en la tarea desatendida, falla con un mensaje claro; no queda esperando una consola.
- El importador de Carga Injerto ahora mezcla las líneas GS entrantes y conserva las inspecciones existentes, observaciones y correcciones QC. La importación de Preinjerto es idempotente y también conserva los datos QC existentes.
- `scripts/install_gs_qc_test_task.ps1` descarga los scripts actuales junto al conector Windows, pide la ruta del JSON de cuenta de servicio TEST, crea la tarea `Viguerapp GS QC TEST Sync` (15 activaciones diarias, una por hora de 06:00 a 20:00, cuando la sesión del usuario está iniciada) y la ejecuta inmediatamente. Los logs diarios quedan en `logs/gs_qc_test_AAAAMMDD.log`.
- **Pendiente de activación local:** este entorno no tiene acceso al Programador de tareas ni a la carpeta Windows del usuario. Para instalarla desde PowerShell:
  `$p='C:\Users\Usuario\Viguerapp-GS-Connector'; Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/Paulalasala26/LaSalaAppp/test/v1.0/scripts/install_gs_qc_test_task.ps1' -OutFile "$p\install_gs_qc_test_task.ps1"; & "$p\install_gs_qc_test_task.ps1"`
- La tarea consulta GS en modo solo lectura y sincroniza **solo Firebase TEST**. No toca GS para escritura, Firebase PRD, Vercel ni `main`.

Los commits de automatización están marcados `[skip-vercel]` porque solo afectan al conector Windows; no requieren publicar la aplicación.
