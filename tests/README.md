# Pruebas automatizadas

La suite contiene automatización para 98 casos UAT distintos en 70 pruebas Playwright:

- UAT-001 a UAT-010: autenticación, sesión, roles, navegación y tamaños PC,
  móvil y tablet.
- UAT-019 a UAT-025: lectura, edición, altas, bajas y cambio de quincena en
  Control.
- UAT-127, UAT-133–134, UAT-138–139, UAT-141–149, UAT-153, UAT-155–157:
  acceso, móvil, filtros, contadores, consulta histórica, bloqueo de altas
  retroactivas, días vacíos, búsqueda y alta manual.
- UAT-183–185: seleccionar opciones y conservar los cambios de Color, Tamaño
  y Raíces.
- UAT-028 a UAT-032: consulta, detalle, edición, búsqueda y Específicos
  asociados en Partidas.
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

La prueba se ejecuta en Chromium. La última ejecución completa verificada fue
62/62 antes de añadir los veinte casos QC. La ejecución local más reciente no
pudo iniciar el navegador porque el Chromium de Playwright no está instalado
en este entorno; queda pendiente ejecutar esos dos casos y repetir la suite.
GitHub Actions conserva el informe, capturas y trazas cuando hay fallos.
