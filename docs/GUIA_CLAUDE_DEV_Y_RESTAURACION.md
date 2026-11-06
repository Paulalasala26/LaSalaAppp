# Guía de Claude para trabajar en DEV y restaurar una copia

**Actualizada:** 6 de noviembre de 2026  
**Repositorio:** https://github.com/Paulalasala26/LaSalaAppp  
**Rama de desarrollo autorizada:** `dev/v1.0`  
**Aplicación DEV:** https://la-sala-app-dev.vercel.app

## 1. Línea base que debe conservarse

La línea base vigente se creó al incorporar a DEV el código de TEST, conservando la configuración y el tema propios de DEV.

- **Commit de código base:** `f26909faa4936d8b06e5beb986c1ea5e31a18b42`
- **Commit que fijó el control de la línea base:** `87814f3cdd0d7f09ff9c774c3d3cdeda7c0ac2bb`
- **Copia inmutable de la línea base inicial:** `backup/dev-v1.0-baseline-2026-11-05` (SHA `87814f3cdd0d7f09ff9c774c3d3cdeda7c0ac2bb`).
- **Copia restaurable de este traspaso:** `backup/dev-v1.0-handoff-2026-11-06`. Consulta su SHA con `git ls-remote --heads origin backup/dev-v1.0-handoff-2026-11-06`; contiene el código de DEV y esta guía.
- **Copia del DEV previo a la promoción:** `backup/dev-v1.0-before-test-promotion-2026-11-05` (`bf081c8212db47b8fc66f854fb0552bba09640ca`)

La copia recomendada para restaurar desde el traspaso de Claude es `backup/dev-v1.0-handoff-2026-11-06`. La copia `backup/dev-v1.0-baseline-2026-11-05` conserva, sin cambios, la línea base original del 5 de noviembre. La rama `backup/dev-v1.0-before-test-promotion-2026-11-05` recupera el DEV anterior a la incorporación desde TEST.

## 2. Instrucciones de arranque para Claude

Pega este encargo al iniciar el trabajo:

> Trabaja exclusivamente sobre `Paulalasala26/LaSalaAppp`, rama `dev/v1.0`, proyecto Vercel `la-sala-app-dev` y Firebase `la-sala-app-dev`. Antes de editar, lee íntegramente el prompt `docs/PROMPT_CLAUDE_DEV_ARRANQUE.md`, esta guía, `docs/DEV_BASELINE_Y_CONTROL_2026-11-05.md`, `docs/APP_R_V3_ESTADO_MAESTRO.md`, `docs/APP_R_V3_ESTADO_MAESTRO_DEV.md` y `docs/APP_R_V3_ENTORNO_DEV.md`. Verifica la rama, el SHA y que el árbol esté limpio. No toques `test/v1.0`, `main`, datos Firebase, configuración/secretos de Vercel ni SharePoint. Espera una tarea concreta. Haz cambios pequeños en DEV, registra el SHA y la validación en el control de cambios, y confirma el despliegue del proyecto DEV. No restaures ni hagas force-push: si hay una rotura, detén cambios, conserva evidencia y avisa al titular para que decida.

### Comprobación inicial

Si Claude aún no tiene una copia local, en PowerShell:

```powershell
git clone https://github.com/Paulalasala26/LaSalaAppp.git
Set-Location .\LaSalaAppp
git fetch origin --prune
git switch --track -c dev/v1.0 origin/dev/v1.0
```

Si el repositorio ya está clonado, abre PowerShell en su carpeta y cambia a `dev/v1.0` antes de continuar.

En PowerShell, desde la carpeta local del repositorio:

```powershell
git fetch origin --prune
git branch --show-current
git rev-parse HEAD
git status --short
```

Antes de trabajar, confirma que la rama es `dev/v1.0`, que el SHA coincide con el remoto y que `git status --short` no devuelve cambios. Si el repositorio local no está en esa rama o tiene cambios, no los descartes: informa al titular y conserva una copia antes de continuar.

### Lecturas obligatorias

1. `docs/PROMPT_CLAUDE_DEV_ARRANQUE.md`
2. Esta guía: `docs/GUIA_CLAUDE_DEV_Y_RESTAURACION.md`
3. `docs/DEV_BASELINE_Y_CONTROL_2026-11-05.md`
4. `docs/APP_R_V3_ESTADO_MAESTRO.md`
5. `docs/APP_R_V3_ESTADO_MAESTRO_DEV.md`
6. `docs/APP_R_V3_ENTORNO_DEV.md`
7. `docs/PROMPT_NUEVOS_DESARROLLADORES.md`

Los historiales pueden contener tareas ya superadas. Contrasta las notas con el código y los despliegues actuales antes de tratar una nota histórica como trabajo pendiente.

## 3. Reglas durante el desarrollo

1. Trabajar solo en `dev/v1.0`. No cambiar a `test/v1.0` ni a `main` para resolver un conflicto.
2. Antes de editar, anotar SHA, archivos afectados y motivo. Si se va a realizar un cambio grande, crear una rama de respaldo del SHA actual y comprobar que existe en GitHub.
3. Limitar cada commit a una tarea funcional. No hacer refactorizaciones, limpiezas o cambios colaterales.
4. Mantener separadas las conexiones Firebase y credenciales de DEV. No sustituirlas por las de TEST ni copiar datos entre bases.
5. No cambiar variables de Vercel, reglas Firebase, permisos, datos operativos ni configuración de SharePoint sin autorización expresa.
6. Actualizar `docs/DEV_BASELINE_Y_CONTROL_2026-11-05.md` o el registro de continuidad vigente con fecha, SHA, alcance, validación y estado.
7. Comprobar que Vercel despliega el SHA en el proyecto `la-sala-app-dev` y queda READY. El READY confirma publicación, no aceptación funcional.
8. Debido al repositorio compartido, Vercel puede generar una vista previa en el proyecto `la-sala-app-test` al recibir commits de DEV. Una Preview con `target=null` no es la aplicación operativa de TEST; no la uses ni la promociones.
9. No ejecutar restauraciones, `git reset --hard`, `git push --force` ni cambios de referencias remotas. Solo el titular realizará la restauración descrita abajo cuando la ordene.

## 4. Restaurar el código DEV a la línea base

Este procedimiento sustituye el puntero de `dev/v1.0` por la copia de línea base. **Solo el titular debe ejecutarlo cuando decida restaurar.** Conserva antes el estado que se va a reemplazar. No restaura ni modifica datos Firebase, variables de Vercel, permisos o archivos ya subidos a SharePoint.

### Paso 1: detener y comprobar

Pide a Claude que detenga cualquier edición, commit o despliegue y que informe del último SHA. Abre PowerShell en el repositorio y ejecuta:

```powershell
git fetch origin --prune
git switch dev/v1.0
git status --short
git rev-parse HEAD
git rev-parse origin/dev/v1.0
```

Si `git status --short` muestra algo o los dos SHA no coinciden, **detente**. No ejecutes el reset: hay cambios locales o nuevas referencias que primero hay que conservar y revisar.

### Paso 2: guardar el estado DEV roto antes de restaurar

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$broken = "backup/dev-v1.0-before-restore-$stamp"
git branch $broken origin/dev/v1.0
git push origin "refs/heads/${broken}:refs/heads/${broken}"
```

Comprueba que la rama quedó publicada:

```powershell
git ls-remote --heads origin $broken
```

Debe devolver un SHA. Esta copia conserva el estado DEV inmediatamente anterior a la restauración.

### Paso 3: verificar y aplicar la copia de línea base

```powershell
git show-ref --verify refs/remotes/origin/backup/dev-v1.0-handoff-2026-11-06
$expected = git rev-parse origin/dev/v1.0
git reset --hard origin/backup/dev-v1.0-handoff-2026-11-06
git push "--force-with-lease=refs/heads/dev/v1.0:$expected" origin "HEAD:refs/heads/dev/v1.0"
```

El `force-with-lease` solo actualiza la rama si nadie la ha movido desde la comprobación de `$expected`. Si el push es rechazado, no reintentes a ciegas: vuelve a hacer `fetch`, compara los SHAs y revisa quién cambió DEV.

### Paso 4: confirmar la restauración

```powershell
git fetch origin
git rev-parse origin/dev/v1.0
git ls-remote --heads origin backup/dev-v1.0-baseline-2026-11-05
```

El SHA de `origin/dev/v1.0` debe coincidir con el SHA de `origin/backup/dev-v1.0-handoff-2026-11-06`. Comprueba la línea base inmutable por separado: `backup/dev-v1.0-baseline-2026-11-05` debe seguir en `87814f3cdd0d7f09ff9c774c3d3cdeda7c0ac2bb`; no compares este SHA con el de `dev`, porque la copia de traspaso incluye commits de documentación posteriores. Si alguna comprobación falla, no continúes.

Después, espera a que el proyecto Vercel `la-sala-app-dev` despliegue ese SHA y quede READY. Comprueba https://la-sala-app-dev.vercel.app. No uses la Preview de TEST como resultado de la restauración. Si el error está en Firebase o en la configuración de Vercel/SharePoint y no en el código, esta restauración no lo resolverá.

## 5. Registro tras cada cambio o restauración

En el control de cambios de DEV anota:

- Fecha/hora (Europe/Madrid) y persona/agente responsable.
- SHA anterior y SHA nuevo de DEV.
- Requisito atendido y archivos o módulos cambiados.
- Copia de seguridad creada antes del cambio.
- Validaciones realizadas y su resultado; distingue READY de una prueba funcional.
- En una restauración, SHA DEV roto conservado, copia restaurada y despliegue resultante.
- Promoción a TEST: solo después de autorización separada, con SHA DEV y SHA TEST anotados.

**La copia base de DEV no es una copia de los datos operativos.** Los datos permanecen en el entorno correspondiente. Las variables `GRAPH_QC_UPLOAD_ENABLED` y `GRAPH_QC_NEW_LIBRARY_ENABLED` estaban desactivadas en DEV según el registro de entorno; no las habilites como parte de una restauración.
