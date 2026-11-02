# Prueba aislada de reglas Firebase — Fase 1

**Nunca ejecutar contra `la-sala-app-test` ni desplegar reglas desde este directorio.** Las pruebas utilizan **solo** el proyecto ficticio local `demo-lasala-phase1` y el emulador de Realtime Database.

Desde un clon completo de `test/v1.0` con Node.js, npm y Java:

```bash
cd docs/firebase
cp package.phase1.json package.json
npm install --ignore-scripts
npm run test:emulator
```

La instalación necesita conexión a npm y la primera ejecución puede descargar el binario oficial del emulador. Si no hay conexión no se puede ejecutar: **no sustituir con pruebas simuladas atribuyéndolas al emulador**.

La suite prueba GET/PUT/PATCH/DELETE denegados para los cuatro nodos y seis perfiles (anónimo + cinco roles), usuarios bloqueados, roles solo lectura autenticada y comportamiento actual del comodín. Los datos utilizados son ficticios y efímeros.

**No equivale a pruebas de integración de las 12 APIs ni a una auditoría completa:** las APIs utilizan token de servicio y deben verificarse por separado. Es deliberado que el wildcard siga abierto para los cinco roles; la Fase 1 NO elimina el riesgo global.

Estado de preparación 02/11/2026: **suite preparada, NO ejecutada contra emulador** en el entorno del asistente porque registry.npmjs.org no resuelve y firebase-tools no está instalado. No publicar las reglas candidatas sin ensayo real y autorización expresa.
