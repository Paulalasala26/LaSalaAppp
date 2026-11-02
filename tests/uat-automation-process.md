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
5. Registrar en SharePoint estado, fecha, ejecutor `Automatización CI`, comentario breve con resultado/commit y enlace al artefacto CI. No reemplazar el libro completo para modificar celdas.
6. Si una prueba no puede ejecutarse por falta de entorno, dispositivo, usuario o expectativa objetiva, permanece pendiente con el motivo concreto.

## Estado de partida

La suite actual cubre UAT-001–010, UAT-019–025, UAT-067–072, UAT-074, UAT-075 y UAT-092. La hoja ya contenía estados previos para algunos de estos casos; las ejecuciones automatizadas se reportan como evidencia nueva, sin reescribir retrospectivamente quién los probó.
