# Pruebas automatizadas

La suite automatiza 54 casos UAT distintos en 46 pruebas Playwright:

- UAT-001 a UAT-010: autenticación, sesión, roles, navegación y tamaños PC,
  móvil y tablet.
- UAT-019 a UAT-025: lectura, edición, altas, bajas y cambio de quincena en
  Control.
- UAT-028 a UAT-032: consulta, detalle, edición, búsqueda y Específicos
  asociados en Partidas.
- UAT-067 a UAT-081, UAT-082, UAT-083 a UAT-096, UAT-100, UAT-112: fechas, quincenas,
  selección de salas e invernaderos, calles, formularios, notas, cancelación,
  vista móvil, persistencia, recarga, edición de instrucciones y ausencia de
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

La prueba se ejecuta en Chromium. GitHub Actions conserva el informe, capturas
y trazas cuando hay fallos.
