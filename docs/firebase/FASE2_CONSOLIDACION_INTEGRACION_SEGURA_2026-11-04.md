# APP R v3 — §0.241 · Consolidación de integración segura (riesgos y gates)

**04/11/2026 — `test/v1.0` — DISEÑO, NO AUTORIZADO PARA DESPLIEGUE**

Se consolida el trabajo de seguridad §§0.225–0.240 para evitar desarrollar prototipos aislados sin un destino de integración. Fuente estructurada de decisión: `docs/firebase/contrato-integracion-riego-v3.json`. El contrato está **bloqueado** (`DESIGN_ONLY_NOT_APPROVED`) y sus comprobaciones de CI solo verifican consistencia entre código y documentación. **No se ha tocado frontend ni Firebase real.**

## Hechos comprobados frente a la aplicación vigente

1. Riego en `lasala-riego-v2-<INV>`, valores RTDB tipo cadena con JSON interno y ETag. No convertir silenciosamente ese dato en un objeto ni admitir doble escritura durante un corte.
2. Índice `lasala-riego-v2-index` y propuestas `lasala-propuestas-riego-v1` separados; aceptar una propuesta modifica riego y estado en pasos diferentes. Esto impide garantizar la atomicidad del proceso actual.
3. Los problemas notificados se guardan como avisos `lasala-avisos-usuario-v1`, con histórico limitado y posible borrado: no se ha acreditado una fuente de negocio duradera separada. Antes de enviar respuesta o Push hace falta una fuente persistida con estado y destinatario/guardia verificados.
4. Los controles por regante (Sala 1 / Sala 2 / Salas 3–5), el rol ADMIN exclusivo de VIGUERAS para decisiones de propuestas y las nueve familias de eventos proceden del inventario de TEST. Las aprobaciones del gestor siguen pendientes.
5. La aplicación dispone de cola de riego en `localStorage`; `403` y `412` requieren tratamiento distinto de desconexión. La línea de QA funcional del frontend, **más de 2.700 pruebas comunicadas por el usuario**, continúa aparte.

## Operaciones: trazabilidad frente a los nueve eventos

El contrato cruza las **12 operaciones** candidatas del backend §0.239 y las **9 familias de avisos** de §0.225, en un mapeo explícito que será validado automáticamente contra `prototype-riego-command-authorization-v3.cjs`, `prototype-event-authorization-v2.cjs`, `avisos-event-catalog-v2.json` y funciones reales de `index.html`.

| Grupo de operación | Eventos de aviso previstos | Límite identificado |
|---|---|---|
| Leer riego | Ninguno | Lectura según ámbito; no generar Push |
| Editar riego | Modificación de riego validado (**solo si procede**) | No avisar por cada guardado; origen de cambio confirmado |
| Borrar riego | **Sin evento definido todavía** | Decidir auditoría, multi-INV y efecto en avisos |
| Crear/aceptar/aceptar con cambios/rechazar propuesta | Cuatro eventos distintos | Transiciones y riego deben compartir unidad confirmada de negocio |
| Marcar/corregir hojas | Dos eventos | Fuente de hecho persistida; sala y actores verificados |
| Reportar/resolver problema de riego | Dos eventos | Problema original, guardia y técnico asignado deben persistir |
| Marcar riego ejecutado | **Sin evento definido todavía** | Validar ruta de escritura y regla funcional antes de incluir en nuevo backend |

Los eventos pendientes **no se inventan para conseguir una correspondencia aparente**; no se crea notificación Push retrospectiva ni se atribuye un evento de riego a cada operación sin validar su semántica.

## Ocho bloqueos obligatorios antes de integrar

| ID | Bloqueo de puesta en marcha | Salida exigida |
|---|---|---|
| B01 | Autoridad revocable y commit no están en la misma frontera | Arquitectura validada de autoridad/CAS común; prueba TOCTOU real |
| B02 | Escrituras directas del cliente antiguo siguen abiertas | Gateway autorizado y reglas que bloqueen exactamente las rutas antiguas sin romper el resto |
| B03 | Formato legado y migración reversibles pendientes | Snapshot, ETags, paridad y ensayo de rollback por INV |
| B04 | Propuestas/multi-INV no son atómicos | Contrato de transición de estado y cambios concurrentes, con recibos |
| B05 | Problemas y guardias sin fuente verificable propia | Registro de problema de negocio, asignación, historial y resolución trazables |
| B06 | Offline y clasificación de errores sin integración | Pruebas de móviles reales, 403/412, duplicados y reconocimiento del servidor |
| B07 | Outbox y Push desconectados de transacciones reales | Cola confirmada, deduplicación y campana, sin duplicar Tuta semanal |
| B08 | Aprobación funcional y UAT no acreditadas | Decisiones del gestor y casos de aceptación documentados |

**Todos bloqueados**: no cerrar un ID por aprobar la prueba sintética correspondiente.

## Programa de trabajo consolidado — seis gates

1. **G1 — Contrato funcional aprobado:** el gestor valida usuarios/roles, salas, excepciones, cada evento y transiciones. Incluye decisiones sobre borrar riego y marcar ejecución, que hoy no tienen evento.
2. **G2 — Autoridad y seguridad reales:** cerrar escritor viejo, establecer autoridad única + JWT + permisos y epoch revalidables en el commit; probar roles, revocación y escritura directa.
3. **G3 — Operaciones integradas:** riego, propuestas, problemas y multi-INV atómicos o con protocolo de consistencia formal; persistencia y recibos.
4. **G4 — Migración y offline:** plan reversible por invernadero, colas pendientes, conflictos, backups y reconciliación con dispositivos.
5. **G5 — Avisos y Push:** outbox, reintentos idempotentes, campana, retención y guardias, preservando cron externo no duplicado.
6. **G6 — Validación final:** backend/UAT real más la línea separada de **más de 2.700 pruebas del frontend**. Consolidar únicamente incidencias y criterios de aceptación, no sus recuentos ni ejecuciones.

**Orden:** no pasar a G3–G5 como ejecución operativa sin definir G1/G2. Sin bloqueos cerrados y evidencias, el estado global es **NO-GO**.

## Pruebas automáticas de este bloque

`docs/firebase/contrato-integracion-riego-v3.test.cjs` comprobará: 12/12 operaciones del backend, 9/9 familias únicas de avisos, funciones reales disponibles en el frontend, roles del gestor, ausencia de eventos inventados, candados de permisos, errores 403/412, bloqueos B01–B08, gates G1–G6 y separación explícita del QA funcional. Se ejecuta junto a toda la batería de seguridad existente en `.github/workflows/firebase-security-phase1.yml`.

**Límite:** un resultado de CI verde aquí significa únicamente que los contratos están sincronizados; **NO significa que APP R v3 tenga las nuevas rutas de backend construidas, reglas instaladas, datos migrados o QA de frontend completada**. Es necesario un trabajo de implementación posterior, con una revisión autorizada antes del primer cambio operativo.

## Próximo paso útil

En lugar de añadir fases de prueba pequeñas, preparar la **decisión arquitectónica G1/G2**: inventario definitivo de rutas, permisos por INV y versión de escritura, contrato API de comandos, estrategia de transición de propuestas/multi-INV, políticas de bloqueo y rollback. Una vez aprobados, implementar el backend y probarlo contra Firebase TEST con protección explícita, separado del control de calidad del frontend.
