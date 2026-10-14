# QC unificado — compatibilidad funcional Túnel / Carga (diseño v0.1)

Fecha: 14/10/2026. Revisión del código fuente de `test/v1.0`, HEAD base `3a102548abdcd24808654930477865269092efb6`. **Documento de diseño, no migración.**

## 1. Reglas innegociables

1. QC es la matriz central de calidad; Túnel y Carga son **estadios**, no sistemas QC separados. Estadios nuevos (Injerto, etc.) se definen después de validar su operativa.
2. **Check Túnel y Check Carga existentes siguen siendo canónicos y operativos** hasta validación explícita. No borrar, renombrar, sobrescribir ni recalcular sus registros ni cambiar sus flujos.
3. El PDF aportado de GS **NO está confirmado como formato oficial**. Ni el modelo QC ni los mapeos de GS dependen de que ese PDF sea definitivo. El visor `admin/gs.html` sigue siendo experimental y de solo lectura.
4. Mantener compatibilidad de almacenamiento `lasala-control-items-v1` / `lasala-control-items-v2-tunel-qN` / `...carga-qN`, índice v2, fotos, PDF, offline, guiones, extensiones y acciones asociadas. No introducir escrituras nuevas todavía.
5. No inferir cantidades afectadas ni porcentajes a partir de casillas históricas.

## 2. Mapeo funcional 1:1 de los registros existentes

| Semántica QC prevista | Check Túnel actual | Check Carga actual | Política inicial |
|---|---|---|---|
| ID inspección antigua | `id` | `id` | **Conservar ID original**, no regenerar |
| Estadio | `tipo:'tunel'` | `tipo:'carga'` | Mismo tipo interno, etiqueta UI dinámica |
| Referencia partida | `partida` | `partida` | Texto tal cual, sin asociación GS automática |
| Fecha de evaluación | `dia` contador de día heredado | `dia` igual | Convertir para presentación usando funciones actuales; no reinterpretar |
| Cliente | en `clienteVariedad` combinado | `cliente` separado | En Túnel, **NO dividir heurísticamente** |
| Variedad | en `clienteVariedad` combinado | `variedad` separado | Igual, no inventar datos |
| Nº bandejas informadas | `numBandejas` (texto) | `numBandejas` (texto) | Mostrar; **no presuponer** que son bandejas inspeccionadas |
| Ubicación física | `invId`, `tramos`, `calleDesde/calleHasta` | `invernadero` y resolución de calle (en algunos casos cruza con Túnel) | Preservar los formatos y la resolución existente |
| Color | `color` diccionario de booleanos | igual | Conservar opciones, **no asignar cantidades** |
| Tamaño | `tamano` diccionario de booleanos | igual | Igual |
| Sanidad | `sanidad` + `sanidadEnfermedades` | igual | Mantener opciones y detalle de enfermedades |
| Flores | `flores` diccionario de booleanos | igual | Igual |
| Raíces | `raices` diccionario de booleanos | igual | Igual |
| Observaciones | `observaciones` | igual | Preservar |
| Imagen | almacenada aparte, vinculada a `id` | igual | No copiar ni alterar fotos |
| PDF adjunto | almacenado por estadio/día | igual | Mantener el circuito de PDF propio de cada etapa |
| Procedencia | `creadoPor`, `creadoEn`, a veces `origenPdf`, `fentrega` | análogo | Conservar opcionales sin inferir su significado ausente |
| Completado | las 5 categorías con al menos 1 opción verdadera | igual | Estado legado, no equiparar a aprobación QC |

### Cinco categorías existentes

- Color: `verde`, `amarillo`, `verdeClaro`, `ok`.
- Tamaño: `grande`, `pequeno`, `ok`.
- Sanidad: `ok`, `enferma`. Detalle independiente: `hojasManchadas`, `hojasAmarillas`, `tuta`, `minador`, `pulgon`, `oidio`, `alternaria`, `botritis`.
- Flores: `si`, `no`.
- Raíces: `pocaRaiz`, `raizVariedad`, `ok`.

**Importante:** las opciones son checkboxes **no excluyentes**; puede haber varias opciones verdaderas dentro de la misma categoría. Unificar la interfaz no debe convertirlos inadvertidamente en una selección única.

## 3. Funcionalidad existente que se conserva sin cambios

**Túnel**
- Filtrado día/quincena, estado e invernadero; búsqueda de partida; agrupación de varias líneas por guiones y selección de línea; vista de evaluación y dashboard; exportación CSV.
- Añadir/editar líneas; asignación de calles y reparto entre distintos invernaderos, importación/verificación de extensiones, observaciones/fotografías, lectura PDF.
- La importación PDF antigua puede crear checks y programar trabajos de Pinzar/Recomponer/Quitar raíces/Plantar/Separar. **No extraer ni reubicar esta función durante el rediseño.**
- Wizard móvil de evaluación distinto para el usuario `GINES`; preservar ruta hasta decidir el reemplazo.

**Carga**
- Filtrado por día/quincena/estado/invernadero, búsqueda, vista de dashboard, evaluación con las mismas categorías y observaciones/fotografías.
- Cliente y variedad separados; PDF de carga y creación automática de líneas mediante parser específico; edición del invernadero; resolución de calle; **no agrupar guiones como en Túnel**.

**Ambos**
- Cola offline, sincronización manual, documentos individuales, escritura dual v1/v2 y referencia a segmentos.
- Backoffice QC consulta y muestra detalle; las acciones Editar/Evaluar hacen handoff a frontend y vuelven al listado cuando procede. Prohibida eliminación desde el recorrido administrativo actual.

## 4. Nuevo modelo de entrada QC — propuesta ADITIVA sin migración

Una futura ficha unificada comprende:

1. **Identificación**: partida, estadio, fecha, identificadores fuente opcionales de GS cuando sean válidos, referencias/cantidades de la inspección.
2. **Evaluación heredada**: cinco grupos con sus **valores originales**, sin cambiar las reglas ni borrar selecciones.
3. **Mediciones nuevas por criterio**: cantidad de bandejas afectadas por cada opción que se cuantifique, unidad y ámbito de medición. `null` representa ausencia de medida; nunca inventar `0` histórico.
4. **Observaciones/evidencias**: almacenamiento compatible con fotos y PDFs existentes.
5. **Resultado QC**: calculado solo cuando existan denominadores, cantidades/no conformidades *sin doble conteo* y reglas de aceptación aprobadas en Backoffice. En ausencia de estos datos, resultado `NO_CALCULABLE`, no `100 %` ni `0 %`.

Posible forma **lógica** (no clave Firebase ni estructura desplegada):
```json
{
  "inspeccionId": "referencia-estable",
  "origen": {"sistema": "legacy-qc", "legacyId": "control_...", "tipo": "tunel"},
  "partida": {"numero": "26X...", "parteGS": null},
  "estadio": "tunel",
  "evaluacionLegacy": {"color": {"amarillo": true}, "tamano": {}, "sanidad": {}, "flores": {}, "raices": {}},
  "cantidades": {
    "bandejasInformadasLegacy": "221",
    "bandejasInspeccionadas": null,
    "medicionesPorDefecto": [{"criterio": "color", "opcion": "amarillo", "bandejasAfectadas": null}],
    "bandejasNoConformesUnicas": null
  },
  "resultadoQC": {"estado": "NO_CALCULABLE", "porcentaje": null, "reglaVersion": null}
}
```

Este ejemplo ilustra el **mapeo de estados** y la distinción entre datos antiguos y mediciones cuantitativas nuevas. Los valores son ficticios.

## 5. Orden seguro de trabajo

1. Revisar mapeo — **documentado**. No desplegar cambios funcionales.
2. Crear ficha QC **independiente y sin guardado** para validar recorrido e inputs nuevos con el usuario.
3. Acordar qué significa el total de bandejas en cada estadio, alcance de la inspección, posible solape de defectos y relación con parte GS. No decidir las ponderaciones todavía.
4. Aprobado lo anterior, acoplar gradualmente la ficha al mismo camino de guardado existente en TEST, con pruebas de lectura/escritura/rollback.
5. Migración o cambios de backend solo tras batería de pruebas y autorización expresa.

## 6. Puntos todavía sin confirmar

- El formato oficial de PDF GS y el mapeo de sus campos.
- Si es necesario asociar una inspección a uno o varios partes GS.
- Cantidades inspeccionadas y denominador de evaluación por estadio.
- Cómo representar una bandeja con múltiples defectos y evitar doble conteo.
- Pesos, invalidaciones, tolerancias, reglas por cliente/pedido y cambios de estadio.
- Qué información debe heredarse entre inspecciones. Ninguna herencia automática hasta decidirlo.

