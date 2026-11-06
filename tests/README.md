# Pruebas automatizadas

La suite contiene automatización para 621 casos UAT distintos en 258 pruebas Playwright (22,5 % de los 2.754 casos; quedan 2.133 sin cobertura). La última ejecución completa pasó 258/258 (2,6 min, dos workers):

- UAT-001 a UAT-010: autenticación, sesión, roles, navegación y tamaños PC,
  móvil y tablet.
- UAT-1945–1949, UAT-1950–1953, UAT-1954–1962, UAT-1970–1974, UAT-1993–1994, UAT-1996, UAT-2001–2005, UAT-2007–2010,
  UAT-2012–2018, UAT-2020–2030 y UAT-2032–2039: orden de Home, abrir/cerrar
  módulos, lectura y punto de avisos no leídos, refresco y concurrencia.
- UAT-159–161 y UAT-172: alta y edición de Túnel con parejas de catálogo importado; se rechaza una combinación ajena.
- UAT-011 a UAT-017: carga inicial de Riego, edición, persistencia, separación
  por invernadero y conservación/sincronización de un cambio al perder y recuperar conexión.
- UAT-486, UAT-493, UAT-495–498, UAT-500–507, UAT-513–514 y UAT-516:
  fechas, uso móvil, legado, orden del formulario y validación/persistencia de Plaguicidas.
- UAT-517–520: elección de mezclas predeterminadas y edición manual de tratamiento/dosis sin selección contradictoria.
- UAT-521–524: independencia de horario y caldo por jornada, y cambio de Pistola/Cañón con asignación correcta de tareas.
- UAT-525–527: restauración de opciones al editar, consulta histórica sin conversión e impresión bloqueada si faltan datos.
- UAT-528–533: selección de invernaderos por origen y sala, retención de objetivos y bloqueo de Pistola entre salas.
- UAT-534–537, UAT-539–541 y UAT-548: alcance de Entero/Entero menos/tramos, observaciones y validación de selecciones inválidas.
- UAT-542–544, UAT-546 y UAT-549: persistencia de tramos por INV, conflicto con Específicos y aislamiento de una jornada de una calle.
- UAT-018 a UAT-027 y UAT-125–126: concurrencia en Riego y Control, lectura, edición, altas, bajas, cambio de quincena y
  concurrencia entre líneas y campos de Control.
- UAT-056–060: Control conserva la sesión y los datos ya abiertos sin red, avisa cuando no puede cargar datos al abrir una pantalla y se recupera al volver la conexión.
- UAT-061–064: dos usuarios trabajan en Control y Riego; guardan cambios concurrentes y repetidos, y verifican que sobreviven a recargas.
- UAT-065: recorrido de 20 minutos virtuales por Control, Riego, Plaguicidas y Partidas sin errores y conservando los cambios.
- UAT-127–137, UAT-138–165, UAT-167–172, UAT-173–177,
  acceso, móvil, filtros, contadores, consulta histórica, bloqueo de altas
  retroactivas, días vacíos, búsqueda y alta manual.
- UAT-181 y UAT-186–209: evaluación QC v6 con cinco bloques, porcentajes por enfermedad, límites, cálculo/edición del porcentaje global, guardado explícito y recuperación.
- UAT-210–214: abrir registros QC legados no los convierte al modelo v6 ni los reescribe.
- UAT-215–218: permisos QC por rol y concurrencia; ADMIN/TÉCNICO pueden capturar, REGANTE/PEÓN no entran, CARGADOR solo accede a Carga y una edición con versión obsoleta no sobrescribe el guardado concurrente.
- UAT-232: en una sesión nueva, el módulo QC se descarga al abrir QC Carga, no al entrar en Inicio, y solo se solicita una vez.
- UAT-1497–1498 y UAT-1505–1506: Mantenimiento agrupa, etiqueta y cuenta tickets activos, excluye cerrados; UAT-1513–1526: Mantenimiento filtra tickets activos por estado y busca por título, INV o usuario; los contadores coinciden con resultados, se puede limpiar la búsqueda y los caracteres especiales se muestran como texto.
- UAT-1549–1550, UAT-1557–1559 y UAT-1561–1562: Mantenimiento rechaza recurrencias inválidas, evita duplicados por doble clic, conserva el formulario ante un error de guardado y permite reintentar; alta por varios INV y sin asignación múltiple.
- UAT-223: importar extensiones actualiza la ubicación del guion de Túnel existente sin crear otra línea.
- UAT-225: tarjetas de Túnel agrupan guiones de una partida y permiten recorrerlos.
- UAT-226–229: imprimir QC Túnel respeta día, invernadero y estado, con página A4.
- UAT-135–137: QC v6 no avisa al navegar sin cambios y protege borradores al cambiar de fecha o sección; UAT-182–185: sin «No evaluada» y selección exclusiva en Color, Tamaño y Raíces.
- UAT-167 y UAT-169: la evaluación v6 aparece en la tarjeta y cerrar/reabrir Control sin editar no dispara un aviso de cambios; UAT-170 pregunta antes de descartar un borrador y conserva o descarta según la elección.
- UAT-171 y UAT-173–175: el editor cambia INV/calles, rechaza ubicaciones inválidas o duplicadas y conserva los tramos existentes al editar otros datos.
- UAT-242–244, UAT-281–284 y UAT-287–290: QC Carga no avisa si no hay cambios, conserva/descarta borradores de forma explícita, permite evaluar desde la tarjeta y cerrar/reabrir sin aviso falso; valida identidad y ubicación.
- UAT-298–334: las nuevas líneas de QC Carga usan cinco bloques v6, permiten porcentajes y global calculado/manual, guardan y recuperan la evaluación; las fichas heredadas siguen legibles y no se convierten al abrirlas.
- UAT-179–180: acciones identificables y táctiles; borrar se puede cancelar.
- UAT-047–049, UAT-356–358, UAT-360, UAT-364–370, UAT-389–390 y UAT-392: fotos de Túnel y Carga quedan dentro de cada inspección, vinculadas a su ID y separadas entre tipos (fixture Firebase en memoria); también se comprueba el control de acceso por rol.
- UAT-358, UAT-360 y UAT-389–390: Túnel y Carga ofrecen por separado «Hacer foto» y «Elegir fotos», conservan acciones utilizables en móvil y escritorio, y una inspección vacía no muestra miniaturas ficticias. La prueba valida los controles del navegador, no una cámara física.
- UAT-128–132, UAT-219, UAT-221–222, UAT-224, UAT-230–231, UAT-233–245, UAT-246–285, UAT-287–293, UAT-295–297, UAT-298–335, UAT-337–340, UAT-343–344, UAT-345–348, UAT-349–353 y UAT-354: navegación diaria,
  filtros, estados, histórico, vista móvil y retorno a Inicio en QC Túnel/Carga.
- UAT-285 y UAT-291: editar una línea de Carga conserva su identidad y ubicación heredada al modificar el cliente.
- UAT-292–293: el editor Carga permite mover una línea a fecha futura preservando datos y bloquea el traslado a una fecha pasada.
- UAT-295–297: acciones de Carga accesibles y táctiles; cancelar el borrado conserva el borrador y confirmar elimina solo la línea seleccionada, manteniendo disponible el alta.
- UAT-354: recorrido de QC Carga, evaluación y edición en viewport móvil.
- UAT-345, UAT-347 y UAT-348: herramientas exclusivas de Túnel y separación de tarjetas al cambiar de tipo.
- UAT-219: QC Túnel ofrece sus herramientas PDF/extensiones sin Dashboard ni CSV operativo.
- UAT-224: comprobar extensiones lista ambos guiones de Túnel sin mutar datos ni incluir una partida de Carga con el mismo número.
- PDF QC (parcial): comprueba mapeo y persistencia desde texto de PDF simulado; no certifica extracción con PDF.js ni cuenta como UAT-220.
- UAT-221–222 y UAT-343–344: la consulta histórica conserva el PDF visible en Túnel y Carga e impide sustituirlo o crear líneas nuevas desde una fecha pasada.
- UAT-183–185: en Color, Tamaño y Raíces, la nueva valoración sustituye a
  la opción marcada anteriormente.
- UAT-152: conservar tramos de calle separados en la tarjeta QC.
- UAT-028 a UAT-032: consulta, detalle, edición, búsqueda y Específicos
  asociados en Partidas.
- UAT-704–743, UAT-744–747, UAT-748–756, UAT-759,
  UAT-761–765 y UAT-766: selector/cambio de INV, orden de salas, fichas y tipos,
  mapas vacíos, scroll, pasillo, filas interactivas, reapertura y búsqueda móvil.
- UAT-767–772, UAT-776, UAT-779, UAT-783, UAT-786, UAT-788, UAT-798 y UAT-820:
  expansión independiente de bandas, movimiento desde/hacia filas altas con huecos,
  apertura de ficha, movimiento a calle vacía, cancelación, persistencia y permuta tocar/tocar.
- UAT-726–743: Partidas muestra quincenas de 14 días, coloca primero el periodo,
  conserva Sala/INV, mantiene la semántica de entrada/salida semanal y recalcula
  el mapa y la ocupación por ID único al cambiar de periodo. UAT-747 recupera por
  búsqueda una partida ya salida; UAT-756 iguala las bandas de un INV desigual;
  UAT-765 marca y nombra los huecos de una calle ocupada.
- UAT-1237–1238, UAT-1302–1303, UAT-1305–1321,
  UAT-1493–1494, UAT-1496–1498, UAT-1501–1503, UAT-1505–1506, UAT-1508–1509, UAT-1510, UAT-1513–1526, UAT-1531–1534, UAT-1536–1537, UAT-1540–1544, UAT-1546–1550, UAT-1551, UAT-1553–1564: Tareas se abre y cierra
  sin duplicados ni escrituras; el alta manual valida, cancela, persiste IDs
  independientes por tarea y reparto a PEÓN/REGANTE; Mantenimiento valida tipo e INV,
  crea un ticket por invernadero y conserva prioridad, fecha y recurrencia; valida intervalos, bloquea duplicados y permite reintentar un guardado fallido sin perder el formulario.
- UAT-033 a UAT-038: lectura, edición, persistencia, cambio de invernadero,
  concurrencia entre celdas y borrado de tratamientos en Plaguicidas.
- UAT-484–485: cambio de quincena en Plaguicidas conserva el invernadero y
  respeta el límite de consulta anterior.
- UAT-039–041, UAT-043 y UAT-044: lectura, edición, persistencia, borrado y
  guardados concurrentes en calles distintas de Específicos.
- UAT-042 y UAT-045–046: asociar Específicos desde Partidas, conservar
  asociaciones concurrentes y mantener cada banner en su partida.
- UAT-050–051 y UAT-383–384: eliminar fotos de QC, conservar cargas concurrentes y rechazar archivos no imagen/dañados.
- UAT-052–055: adjuntar PDFs persiste tras recargar, cada día abre su propio
  archivo y dos usuarios conservan sus índices concurrentes (Firebase simulado).
- UAT-067 a UAT-110, UAT-112 y UAT-114 a UAT-124: fechas, quincenas,
  selección de salas e invernaderos, calles, formularios, notas, cancelación,
  vista móvil, persistencia, recarga, edición y borrado seguro de instrucciones,
  preservación de texto histórico, consulta histórica de solo lectura, selección
  de un día para impresión, alcance por invernadero, vista previa A4, aviso para
  días sin riegos, guardado limitado a los destinos, doble clic y ausencia de
  tareas ficticias.

Cada prueba lleva los ID que cubre en su nombre. Los casos no incluidos siguen
pendientes; una prueba verde solo se atribuye a los ID cuyas condiciones
específicas comprueba.

Todas las peticiones a la URL de Firebase de la app se interceptan dentro de
Playwright. Las pruebas usan una base de datos efímera en memoria y no escriben
ni leen datos de Firebase TEST o PRD.

El procedimiento de clasificación, aislamiento, ejecución y registro de
resultados está en [uat-automation-process.md](./uat-automation-process.md).

Requisitos: Node.js 22 o 24 y pnpm.

```sh
pnpm install
pnpm exec playwright install chromium
pnpm test:e2e
```

La prueba se ejecuta en Chromium. La última corrida completa pasó 258/258 en 2,6 min; el informe JSON y el CSV se regeneran al ejecutar la suite. Se fijan dos workers por defecto: UAT-018 falló una vez con ocho procesos paralelos, pero pasó aislada y en las últimas corridas completas con dos.
En este entorno, Chromium está en el caché local de Playwright; si Playwright no lo detecta automáticamente, define
`PLAYWRIGHT_BROWSERS_PATH` con esa carpeta antes de ejecutar la suite.
El workflow [UAT Playwright](../.github/workflows/uat-playwright.yml) ejecuta la suite en push/PR y conserva siempre los informes JSON/HTML; las capturas y trazas se adjuntan cuando hay fallos. Su ejecución remota se confirmará cuando el cambio llegue a GitHub.
Tras cada corrida, `node tests/export-uat-results.cjs` genera `test-results/uat-results.csv`: 621 filas, una por UAT cubierto, fecha, resultado, prueba, archivo, línea y duración. `PASA_FIXTURE` significa que pasó con Firebase interceptado en memoria; no equivale a una validación de Firebase TEST/PRD ni se debe copiar como OK manual.
