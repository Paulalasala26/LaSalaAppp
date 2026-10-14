# QC — Modelo de datos GS / inspecciones (v0.1)

**Fecha:** 14/10/2026. **Estado:** diseño acordado y validación sobre un PDF de muestra. **Entorno:** TEST exclusivamente. No aplica migración ni escribe en Firebase.

## 1. Principio funcional

GS proporciona el **maestro de partidas** mediante informes PDF. Un **parte GS** describe una actuación sobre una partida; relación **N partes : 1 partida**. Los **controles QC** son evaluaciones propias de ViguerAPP, por estadio productivo, y **no vienen del PDF GS**.

No transformar automáticamente los partes en inspecciones, ni sumar sus cantidades para calcular stock real: las mismas bandejas pueden intervenir en diferentes actuaciones.

## 2. Fuente de prueba contrastada

Archivo aportado: `Riego.pdf`. El **contenido** se titula "Listado Salidas Previstas de Prendimiento", fechado 14/10/2026. Una página con 25 partes y 16 partidas distintas; suma de cantidades mostradas en los partes: 301.950 plantas y 2.188 bandejas (no stock único).

Columnas leídas: TSI, Nº Parte, Nº Partida, Nº Plantas, Nº Bandejas, Localizacion, Fec Entrada, Hora Entra, Fec Prev Salida y Obs. **No aparecen** cliente, variedad, especie, número de pedido ni datos de evaluaciones QC. No inferirlos.

Ejemplo:
- Partida `26YE0135`.
- Parte `26008665`: 296 bandejas, 44.380 plantas, ubicación GS `114-113-112-111-110-109`, entrada 01/10/2026 08:55, salida **prevista** 08/10/2026.
- Parte `26008668`: 42 bandejas, 6.220 plantas, ubicación GS `88`, entrada 02/10/2026 07:44, salida **prevista** 09/10/2026.

No interpretar el código TSI (PI15, PI48, TI15) como un estadio QC sin confirmación. Tampoco convertir `Localizacion` en invernadero/calle de ViguerAPP sin mapeo validado. Las partidas `YE` y `ZE` deben conservarse: el filtro heredado del importador PDF específico de Check Túnel **no** corresponde al maestro GS.

## 3. Entidades lógicas (propuesta; no nuevas rutas Firebase todavía)

### PartidaGS
- `numeroPartida` **string**, identificador principal, sin transformar ni quitar ceros.
- `datosMaestros`: datos confirmados y disponibles en las fuentes GS; **no** asumir cliente, variedad o pedido en este informe.
- `fuentes`: referencias de documentos GS de los que procede la información.
- Relación: `partesGS` (0..N), `inspeccionesQC` (0..N).

### ParteGS
- `numeroParte` **string** (no tratar como número para evitar perder ceros), `numeroPartida` **string**.
- `tsi` string opaco, sin traducción automática a etapa.
- `plantasEnParte` número, `bandejasEnParte` número; representan la **cantidad de la actuación**.
- `localizacionGS` cadena original; `fechaEntrada` fecha ISO; `horaEntrada` HH:mm.
- `fechaPrevistaSalida` fecha ISO, diferente de salida real.
- `observaciones` cadena opcional.
- `procedencia`: archivo, hash, tipo/fecha de informe, página/filas si es posible.
- Criterio de posible coincidencia entre documentos: `numeroParte` + `numeroPartida`; antes de un UPSERT real, confirmar unicidad del identificador de parte en GS. No borrar ni sobrescribir silenciosamente versiones conflictivas.

### InspeccionQC
- `id` propio de ViguerAPP; `numeroPartida` obligatorio.
- `parteGSRefs` opcional, 0..N si la inspección abarca cantidades de actuaciones concretas.
- `estadio` y fecha/hora real de observación.
- `alcance` (partida/parte/fracción/muestra), `bandejasEvaluadas`, y cantidades afectadas por cada criterio.
- `mediciones` dinámicas según estadio (color, tamaño, sanidad, flores, raíces, etc.).
- `evidencias`, `observaciones`, `usuario`, `histórico`.
- Resultado en porcentaje, ponderaciones, rechazo/invalidez y reglas **pendientes de definición en Backoffice**. No equiparar puntuación a porcentaje físico apto sin conocer solapes entre defectos.

## 4. Compatibilidad con aplicación existente

- `lasala-partidas-v1`: existe en la aplicación y contiene datos de otra función de partidas; **no** renombrarlo ni asumir que ya es el maestro GS.
- QC heredado: `lasala-control-items-v1`, segmentos `lasala-control-items-v2-tunel-qN` y `...-carga-qN` más índice v2. Conservar íntegramente.
- El importador actual de PDF para Túnel/Carga extrae datos de otro formato y tiene reglas de exclusión, generación de checks y trabajos: **no utilizarlo directamente** para el nuevo maestro GS, ni modificarlo en esta fase.
- No añadir keys ni tocar reglas/estructuras Firebase, ni PRD ni `main` hasta el diseño y pruebas de migración.

## 5. Flujo funcional

1. Adjuntar PDF GS para lectura y **vista previa** (sin escrituras automáticas).
2. Extraer partes y agruparlos por número de partida; validar totales, formatos, duplicados y campos desconocidos. Mostrar advertencias.
3. Aprobar una importación controlada en fase posterior; asociar procedencia por parte y partida.
4. Seleccionar la partida desde QC e inspeccionarla con un único formulario dinámico según estadio.
5. Evaluar reglas de calidad en Backoffice; conservar historial.
6. **Fase 1.2:** automatizar la alimentación GS y sustituir únicamente la entrada manual de PDF.

## 6. Casos mínimos de aceptación

- El informe de muestra devuelve exactamente **25 partes**, **16 partidas**, 301.950 plantas y 2.188 bandejas **en partes**.
- `26YE0135` mantiene ambos partes independientes; `26X02354` mantiene tres.
- Subtotales y total final del PDF nunca se consideran partes.
- `YE`, `ZE` y `X` se aceptan; nunca inferir especie o estadio.
- El fichero repetido no crea duplicados; si un parte cambia entre PDFs se muestra conflicto/actualización, no se sobrescribe sin trazabilidad.
- Fecha prevista de salida nunca se transforma en salida real.
- La lectura no crea QC, no genera tareas y no modifica Firebase.

## 7. Próxima implementación

Primera pantalla: **Backoffice > QC > Importar GS (previsualización)** con autenticación ADMIN, validación y cero escrituras. Después de probar el PDF real y recibir conformidad se habilitará persistencia controlada del maestro GS. Un solo cambio funcional cada vez.
