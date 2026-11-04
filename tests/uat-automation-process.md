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

La suite contiene automatización para 81 casos UAT distintos en 65 pruebas Playwright: UAT-001–010, UAT-019–025, UAT-028–032, UAT-067–110, UAT-112, UAT-114–124, UAT-127, UAT-138 y UAT-141–142. Antes de añadir los cuatro casos nuevos de QC, la ejecución local completa pasó 62/62. La última ejecución no pudo iniciar Chromium porque el navegador de Playwright no está instalado en este entorno; los casos nuevos y la repetición completa quedan pendientes de ejecución. La hoja ya contenía estados previos para algunos casos; las ejecuciones automatizadas se reportan como evidencia nueva, sin reescribir retrospectivamente quién los probó.

Entre las verificaciones ya incorporadas: UAT-076 bloquea la edición directa de celdas; UAT-086 bloquea tramos invertidos; UAT-087 conserva la selección de varios invernaderos; UAT-089 preserva la nota adicional; UAT-096 y UAT-100 protegen el contenido y evitan doble guardado; UAT-097–099 preservan texto histórico y limitan cambios a los destinos elegidos; UAT-101–105 comprueban consulta histórica, límites de rol y acceso de VIGUERAS; UAT-106–110 protegen el borrado y su confirmación; UAT-114–124 verifican el selector diario de impresión, filtros por quincena/invernadero, vista previa A4 y bloqueo de hojas vacías. La prueba de impresión usa fixtures en memoria: no certifica datos reales de Firebase.

UAT-111 y UAT-113 permanecen pendientes: la hoja espera generación/actualización automática de tareas desde Trabajo, mientras que la versión actual de la app usa «Generar tareas» de forma explícita para prevenir duplicados. UAT-125–126 y la sincronización concurrente necesitan un Firebase TEST aislado para certificar comportamiento real. El workflow E2E está en el PR, pero no hay ejecución de GitHub Actions mientras el workflow no esté en la rama base. La hoja de SharePoint no se ha actualizado: no hay sesión Excel conectada ni herramienta disponible para escribir rangos; el lote sigue pendiente de registro.

La expansión ya incluye cuatro verificaciones iniciales de QC (UAT-127, UAT-138 y UAT-141–142). El siguiente lote debe cubrir fechas y estados de QC que puedan reproducirse con datos aislados; después, la discrepancia de UAT-111/113, Plaguicidas, Específicos y Tareas presentes en este checkout. Los casos de Firebase real, fotos, concurrencia, desconexión y sincronización no se simulan como integración real. Los módulos que no existen en este checkout se registran como bloqueados por funcionalidad ausente hasta localizar el código correspondiente.
