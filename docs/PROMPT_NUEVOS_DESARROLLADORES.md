# Prompt de desarrollo para nuevos desarrolladores — ViguerAPP / APP R

Antes de tocar código, lee `docs/APP_R_V3_ESTADO_MAESTRO.md` en la rama `dev/v1.0` y confirma el estado real del repositorio, la rama y el diff. Ese documento recoge el contexto funcional vigente; contrástalo con el código actual y no conviertas notas históricas en tareas actuales.

Para el estado de los entornos, lee también `docs/APP_R_V3_ENTORNO_DEV.md`. **No asumas que una validación de consulta equivale a pruebas de escritura, offline o SharePoint.**

## Regla de crecimiento del frontend

`index.html` es el shell de la aplicación, no el lugar para seguir añadiendo funcionalidades. Mantén fuera de ese archivo el código nuevo de cada área:

- JavaScript en archivos propios bajo `assets/`, agrupados por módulo funcional.
- CSS en hojas propias bajo `assets/` (o en la ubicación ya establecida por el área).
- En `index.html`, limita los cambios a referencias, configuración mínima y puntos de integración imprescindibles.

La separación de archivos, por sí sola, **no reduce lo descargado**: un script incluido normalmente sigue bajándose al cargar la página. Si el objetivo es reducir primera carga, mide bytes transferidos (incluido gzip) y solicita un recurso bajo demanda solo después de comprobar sus dependencias, rutas de entrada, orden de ejecución, carga concurrente y reentrada. No introduzcas módulos ES, `import()`, carga diferida ni cambios de estrategia de caché en una refactorización estructural sin validación aislada previa y aceptación funcional en DEV.

## Preservación del comportamiento

- No aproveches una extracción para reescribir, renombrar, “limpiar” o cambiar lógica. Si es imprescindible mover código existente, conserva el bloque de forma exacta salvo el mínimo punto de integración documentado.
- Conserva orden de ejecución, nombres globales, contratos, listeners, permisos, rutas, estados, formularios, impresión, funcionamiento offline y sincronización. Identifica las dependencias antes de editar.
- No cambies APIs, datos, esquemas, autenticación, service worker ni reglas de negocio como parte de una tarea de organización de archivos, salvo que el usuario lo solicite por separado.
- Si no puedes demostrar que un cambio estructural conserva el comportamiento, no lo integres: restaura el backup y deja constancia concreta de la incertidumbre.

## Flujo de trabajo seguro

1. Trabaja únicamente en `dev/v1.0`; no cambies `test/v1.0`, `main` ni el PRD; despliega únicamente en el proyecto Vercel DEV.
2. Antes de modificar archivos, crea y verifica un backup recuperable del estado exacto que vas a tocar.
3. Mantén el cambio pequeño y acotado al módulo solicitado. No hagas varias extracciones a la vez.
4. Comprueba referencias, dependencias, sintaxis y diferencias contra el original. Mide el tamaño real de la primera carga si afirmas que se redujo.
5. Documenta qué archivos cambian, qué dependencias se preservaron, evidencia de validación y qué aceptación de usuario sigue pendiente. No declares UAT o funcionamiento real sin confirmación observada.
6. Ante cualquier regresión o duda sobre el flujo, revierte el cambio completo usando el backup verificado y confirma el estado restaurado antes de continuar.

**Criterio permanente:** el HTML principal no debe seguir creciendo con nuevas funcionalidades. Prioriza módulos externos pequeños y cohesivos; realiza refactor de código existente solo cuando haya una necesidad medida, un backup y un camino claro de validación y reversión.

## Aislamiento permanente DEV

- El frontend y las API de DEV apuntan exclusivamente a Firebase `la-sala-app-dev`; nunca reutilices la URL, API key ni cuenta de servicio de TEST.
- Vercel DEV utiliza su propia variable `FIREBASE_SERVICE_ACCOUNT_JSON`; las fotos SharePoint permanecen deshabilitadas hasta aislar su biblioteca y autorización.
- Cron de retención deshabilitado en `vercel.json` de DEV hasta validación específica. Los cambios funcionales se prueban primero en DEV y solo se promocionan a TEST tras autorización.
- La copia de datos desde TEST es una instantánea inicial, no una sincronización bidireccional. No realices procesos de reversión o de importación que sobrescriban datos operativos sin validarlo previamente.
