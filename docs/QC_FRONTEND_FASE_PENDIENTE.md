# APP R v3 — Fase FRONTEND QC pendiente (tras Backoffice)

Estado: **fase iniciada en TEST** el 15/10/2026. **No autoriza modificar PRD.**

### Primera entrega frontend

- Botón **Medir bandejas QC** en cada tarjeta operativa de Check Túnel y Check Carga.
- Formulario móvil con nº total de bandejas inspeccionadas y cantidades obligatorias por cada opción seleccionada.
- Lectura y guardado de `lasala-qc-mediciones-v1` mediante API con control ETag/versionado. La escritura histórica de check Túnel/Carga permanece independiente e intacta.
- Acceso autorizado en servidor: ADMIN y TECNICO ambos estadios; CARGADOR exclusivamente Carga. REGANTE y PEON no autorizados a este nuevo endpoint.
- Sin cola offline artificial: cuando no se confirme la escritura, no se muestra éxito.
- **Pendiente de validar con usuarios reales:** el formulario tradicional mantiene sus checks. Tras la batería funcional, unificar en una sola evaluación obligatoria con cantidades e indicadores para evitar la doble interfaz. No se ha realizado ese reemplazo.


## Alcance que no debemos olvidar

**Una vez validado el Backoffice y su panel de indicadores**, integrar el modelo QC unificado en el **frontend operativo ViguerAPP**, especialmente las pantallas de Check Túnel y Check Carga, con diseño adaptable a móvil/tablet y flujo diario de operarios.

1. **No romper las operaciones actuales**: Check Túnel, Check Carga, listado por quincenas, agrupación de guiones, calle/invernadero, PDFs, fotos, observaciones, importaciones específicas, sincronización/offline y tareas asociadas siguen vigentes hasta su sustitución validada.
2. **Una ficha QC única por estadio** con identificación de partida, datos del control y evaluación; unificar navegación sin suponer que cada opción es excluyente.
3. **Cantidades obligatorias** por opción seleccionada: p. ej., al marcar "Amarillo" indicar un entero positivo de bandejas amarillas. Introducir siempre bandejas efectivamente inspeccionadas y no asumir equivalencia con `numBandejas` heredado.
4. Mantener separados datos heredados de `lasala-control-items-v1` y v2 de las **mediciones cuantitativas** (nodo aditivo `lasala-qc-mediciones-v1`). Conservar IDs estables; comprobar edición concurrente y no pisar cambios de otro usuario.
5. Mostrar **indicadores informativos** de cantidades / porcentajes y alertas por criterios; **no rechazar, bloquear ni cambiar estados de partidas o pedidos automáticamente**, tampoco cuando una regla sea «Crítico». No inventar una nota global ni sumar bandejas con múltiples defectos.
6. Permitir configuración administrativa de criterios por estadio desde `admin/qc-criterios.html`; el frontend operativo consumirá los criterios **solo para visualizar indicadores**, no para aplicar decisiones de calidad.
7. **Roles**: hoy el backoffice y las mediciones nuevas requieren ADMIN. Antes de liberar al operario, definir permisos por rol con validación **en servidor y Firebase**, sin abrir indebidamente el backend administrativo.
8. Validar **uso móvil**, cabeceras, controles, botón Guardar, retorno al listado y experiencia con conectividad intermitente/offline; no introducir un guardado offline ficticio en el nuevo módulo.
9. **GS**: el PDF de ejemplo no está confirmado. No sustituir los importadores Túnel/Carga existentes ni introducir mapeos GS definitivos hasta validación.
10. **TEST primero**: pruebas con partidas y usuarios reales, concurrencia, recuperación, compatibilidad y UAT; solo después decidir promoción a PRD con aprobación expresa.

## Estado Backoffice (15/10/2026)

- `admin/control.html`: listado y acción única «Abrir QC» (sin borrar editor operativo original).
- `admin/qc-ficha.html`: lectura de control, evaluación heredada, captura/guardado de mediciones y porcentajes por criterio.
- `admin/qc-criterios.html`: configuración de tratamientos y tolerancias por Túnel/Carga, guardada sin rechazo automático.
- `admin/qc-dashboard.html`: cuadro global de medidas, comparativa, evolución semanal y consulta de partidas. Solo registros con medidas cuantitativas guardadas.
- `admin/gs.html`: visor PDF provisional, sin importación a Firebase.

**Próximo gran bloque tras validar el dashboard Backoffice: frontend QC operativo**, fase a fase, no tocar PRD directamente.

## Limitación del MVP Dashboard

El endpoint de indicadores lee el nodo de mediciones y filtra hasta 91 días por consulta. Para volúmenes elevados habrá que segmentar o indexar mediciones por fechas/estadios sin perder los registros ya guardados. Las alertas históricas se recalculan según reglas actuales; no son decisiones históricas ni rechazos.
