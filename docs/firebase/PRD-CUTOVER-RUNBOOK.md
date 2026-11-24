# Corte de TEST a PRD — procedimiento preparado

## Estado

- La aplicación PRD en la rama `security/prd-rtdb-routing` usa `/prd` para datos operativos y conserva en la raíz las claves compartidas.
- La vista previa está desplegada y revisada por el propietario.
- Este documento prepara el corte; **no ejecuta lecturas, copias ni escrituras en Firebase**.
- No se cambiarán las reglas de RTDB mientras haya usuarios trabajando en TEST.

## Destino de datos

La copia final será de las claves operativas que hoy viven en la raíz de RTDB a sus mismas rutas bajo `/prd`. Se conservará intacta la raíz de TEST.

Se mantendrán compartidas y no se copiarán:

- `lasala-users-v1`
- `lasala-roles-v1`
- `lasala-config-riego-opciones-v1`
- `lasala-config-infra-v1`
- `lasala-gs-partes-v1`
- `lasala-gs-carga-v1`
- `lasala-gs-carga-injerto-v1`
- `lasala-gs-preinjerto-v1`

El resto de claves raíz se tratará como dato operativo y se copiará bajo `/prd`. Esto cubre QC, riegos, tareas, específicos, fitosanitarios, fotos e históricos, incluidos los nodos con sufijos dinámicos como los shards.

## Secuencia del corte

1. Confirmar que la fase de TEST ha terminado y fijar la hora de corte.
2. Pedir a los usuarios que sincronicen sus borradores y fotos pendientes y cierren la app. Pausar los sincronizadores locales para que no haya escrituras durante la captura.
3. Exportar la raíz de TEST como copia de seguridad privada fuera de GitHub. Registrar timestamp y manifest de las claves.
4. Comprobar que `/prd` está vacío. Si contiene cualquier clave, abortar y revisarla; no sobrescribirla.
5. Copiar cada clave operativa a `/prd/<clave>` con escritura condicionada a destino inexistente. Registrar claves copiadas y resultado por clave.
6. Leer de nuevo origen y destino y comparar por clave tamaño, estructura y hash canónico. No continuar si falta o difiere una clave.
7. Publicar en la rama de producción PRD el código ya revisado, con `VIGUERAPP_ENV=prd` y la cuenta de servicio configurada. Refrescar sesiones PRD para que sus tokens incluyan la reclamación de entorno.
8. Aplicar las reglas RTDB candidatas en una única operación y comprobar ambos entornos: TEST raíz, PRD `/prd`, comunes en raíz.
9. Reabrir primero PRD para comprobación; reanudar TEST y los sincronizadores después de confirmar que siguen leyendo/escribiendo en su raíz.

## Condiciones para abortar

- La fase de TEST sigue activa o hay usuarios/dispositivos con datos pendientes de sincronizar.
- `/prd` no está vacío.
- No se puede generar o verificar la copia de seguridad.
- La comparación de cualquier clave falla.
- Las pruebas finales de TEST, PRD o claves compartidas fallan.

En un aborto, no se cambian las reglas ni se borra ningún dato. La importación debe ser idempotente y dejar un manifest para reanudar sin duplicar ni sobrescribir.

## Secretos y permisos

La cuenta de servicio se leerá desde una variable de entorno local protegida en el proceso de corte. Nunca se guardará en este repositorio, en el manifest ni en el chat. Las credenciales de usuarios no se trasladan: ambas aplicaciones conservan el mismo nodo compartido de usuarios y roles.
