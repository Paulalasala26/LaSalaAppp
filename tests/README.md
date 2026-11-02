# Pruebas automatizadas

La suite automatiza UAT-001 a UAT-010 (autenticación, restauración/cierre de
sesión, acceso por rol, navegación y viewport de PC/móvil/tablet), UAT-019 a
UAT-025 (Control), UAT-028 a UAT-031 (consulta, detalle, edición de calle y
búsqueda de Partidas), y
UAT-067 a UAT-072, UAT-074, UAT-075 y UAT-092 (entrada a Riego, fechas,
quincenas, cambio de invernadero, alta/edición y cancelación). Son 28 casos UAT
distintos en 26 pruebas Playwright; cada prueba lleva los ID que cubre en su
nombre.

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
