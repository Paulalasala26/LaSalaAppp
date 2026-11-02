# Procedimiento de automatización de QC

## Alcance y fuente

- La hoja **La Sala - APP Riego. QC.xlsx** es la fuente de verdad: 2.754 casos UAT identificados por `UAT-####`.
- Se mantiene un mapeo unívoco entre cada ID de la hoja y su prueba automatizada. No se usa el número de fila como identificador.
- Un estado que ya existía en SharePoint se conserva como resultado anterior; solo se atribuyen a automatización los casos ejecutados desde este flujo.

## Clasificación y orden

Cada caso se clasifica por su comprobación principal:

1. **Navegador**: login, navegación, formularios, permisos visibles, renderizado, selección de fechas y persistencia de interfaz.
2. **Contrato de datos**: lectura, escritura, límites, duplicados, relaciones y conflictos verificables con una base simulada.
3. **Integración TEST**: operaciones que dependan de Firebase TEST real, almacenamiento de fotos, procesos externos o autenticación real. Se automatizan solo con credenciales y recursos de TEST aislados.
4. **Manual**: hardware real, cámaras, interacción táctil física, red móvil, concurrencia entre dispositivos reales o validaciones agrícolas/visuales que no tengan un oráculo objetivo.

Se priorizan casos de prioridad Alta y flujos reutilizados. Una prueba puede cubrir una ruta compartida, pero cada UAT conserva su propio resultado y solo se marca cuando sus condiciones específicas se verifican.

## Aislamiento y protección de datos

- Las pruebas de interfaz interceptan todas las llamadas Firebase y usan datos efímeros en memoria con prefijo `E2E-`.
- Solo se permite el host Firebase TEST esperado; cualquier otro host se bloquea y hace fallar la prueba.
- No se usan credenciales reales ni se escriben registros en Firebase PRD.
- Los casos de sincronización real requieren proyecto/credenciales TEST separados y comprobación del destino antes de habilitar la escritura.
- Borrados solo se prueban sobre registros creados por la propia prueba en su fixture efímero.

## Criterio de resultado

- **OK**: ejecución automatizada verde y aserciones que cubren el resultado esperado completo, incluida persistencia cuando aplique.
- **ERROR**: la prueba reprodujo una discrepancia. Se añade resumen de fallo y evidencia; después de corregir el producto, se vuelve a ejecutar antes de cambiar a OK.
- **PENDIENTE**: no existe prueba completa, no se ejecutó, o depende de entorno/actor todavía no disponible.
- **NO APLICA**: se conserva solo cuando la hoja ya lo justifica o la prueba no aplica al rol/flujo; no se asigna por conveniencia.

## Ejecución y evidencia

1. Añadir una prueba Playwright con el ID UAT visible en el nombre.
2. Ejecutar localmente en Chromium contra la copia servida desde `127.0.0.1`, con fixtures aislados.
3. Corregir defectos reproducibles y volver a ejecutar el caso y el lote afectado.
4. GitHub Actions repite la suite en pull request y conserva informe, capturas y trazas de fallos.
5. Registrar en SharePoint en lotes verificados: estado, fecha, ejecutor `Automatización CI`, comentario breve con resultado/commit y enlace al artefacto CI. Escribir únicamente los rangos de las filas afectadas mediante la sesión conectada de Excel; nunca reemplazar el libro completo. La autorización de trabajo cubre los lotes y no se solicita aprobación caso por caso. Si no hay una sesión Excel conectada, conservar el lote pendiente y seguir con la automatización local/CI hasta que el canal de rangos esté disponible.
6. Si una prueba no puede ejecutarse por falta de entorno, dispositivo, usuario o expectativa objetiva, permanece pendiente con el motivo concreto.

## Ciclo de trabajo en segundo plano

1. Leer y clasificar el inventario UAT una vez por lote; volver a leer solo cuando cambie el libro o se actualicen estados.
2. Priorizar flujos de alta reutilización y casos reproducibles con datos simulados. Añadir cobertura por ID, reproducir los fallos y corregir el producto cuando el resultado esperado esté claro.
3. Ejecutar primero el módulo modificado y después la suite completa. GitHub Actions sirve de segunda ejecución y publica el informe y las trazas.
4. Al terminar cada lote verde, preparar una única escritura agrupada en las filas correspondientes y verificar inmediatamente que los valores guardados coinciden. No se crean sesiones ni aprobaciones por cada UAT.
5. Mantener separados los resultados automatizados simulados, los resultados de integración TEST y las verificaciones manuales; no presentar una simulación como escritura real en Firebase.

## Estado de partida

La suite actual cubre UAT-001–010, UAT-019–025, UAT-028–032, UAT-067–098, UAT-100 y UAT-112: 56 casos UAT en 48 pruebas Playwright. La hoja ya contenía estados previos para algunos casos; las ejecuciones automatizadas se reportan como evidencia nueva, sin reescribir retrospectivamente quién los probó.

En iteraciones anteriores UAT-076 detectó edición directa no permitida en la cuadrícula de Riego; las celdas ahora son de solo lectura y se editan desde el formulario. UAT-086 detectó que los tramos invertidos se aceptaban; ahora se bloquean y se explica cómo corregirlos. UAT-087 detectó que los tramos de otros invernaderos se perdían al cambiar la selección; el estado visible se conserva antes de reconstruir los paneles. UAT-089 confirmó que la nota adicional se sobrescribía sobre el riego; ahora se almacena junto a la programación. En la tanda anterior, UAT-082 añade un resumen de invernaderos seleccionados agrupado por sala con contador y acción para retirar uno. UAT-096 verifica la edición conservando Trabajo y horario; el guardado espera la confirmación de escritura para mantener bloqueada la acción Aplicar durante la operación y evitar escrituras repetidas (UAT-100). UAT-097–098 comprueban que el texto histórico desconocido se conserva al guardar sin cambios y que cambiarlo avisa antes, respetando la cancelación. La suite de 46 pruebas y el CI de esa tanda pasaron; los dos casos nuevos también pasan individualmente.

La siguiente expansión prioriza UAT-099 y UAT-101–126 de Riego, y después los módulos QC, Plaguicidas, Específicos y Tareas presentes en el código. Los casos de Firebase real, fotos, concurrencia, desconexión y sincronización requieren un proyecto TEST confirmado y credenciales de prueba; no se simulan como integración real. Los módulos que no existen en este checkout se registran como bloqueados por funcionalidad ausente hasta localizar el código correspondiente.
