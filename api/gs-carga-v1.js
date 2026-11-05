'use strict';
// TEST: lectura autenticada del snapshot diario de QC Carga importado desde GS.
// No escribe en GS, Firebase ni en los nodos históricos/QC de Viguerapp.
const {
  verifyFirebaseIdToken,
  serviceAccount,
  serviceAccessToken,
  readKey,
  validHash,
  httpError
} = require('./admin-users')._adminCatalogHelpers;

const DB = 'https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const ALLOWED_ROLES = new Set(['ADMIN', 'TECNICO', 'CARGADOR']);
const MAX_LINES = 5000;

function isISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function requestedDate(query) {
  const value = query && query.fecha;
  if (!isISODate(value)) throw httpError(400, 'INVALID_DATE');
  return value;
}

function validateSnapshot(snapshot, fecha) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      !snapshot.metadata || typeof snapshot.metadata !== 'object' ||
      snapshot.metadata.module !== 'qc_carga' ||
      snapshot.metadata.fecha !== fecha ||
      !snapshot.lineas || typeof snapshot.lineas !== 'object' ||
      Array.isArray(snapshot.lineas)) {
    throw httpError(502, 'INVALID_GS_SNAPSHOT');
  }

  const entries = Object.entries(snapshot.lineas);
  if (!entries.length || entries.length > MAX_LINES ||
      snapshot.metadata.lineCount !== entries.length) {
    throw httpError(502, 'INVALID_GS_SNAPSHOT');
  }

  for (const [key, line] of entries) {
    if (!line || typeof line !== 'object' || Array.isArray(line) ||
        line.id_linea_carga !== key || line.fecha !== fecha ||
        typeof line.id_carga !== 'string' || typeof line.partida !== 'string') {
      throw httpError(502, 'INVALID_GS_SNAPSHOT');
    }
  }
  return snapshot;
}

async function readSnapshot(fecha, token) {
  // Se codifica cada segmento, no el path entero, para conservar /by-date/.
  const url = DB + '/lasala-gs-carga-v1/by-date/' + encodeURIComponent(fecha) + '.json';
  const response = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('GS snapshot read failed');
  return response.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Authorization');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const authorization = req.headers && req.headers.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      throw httpError(401, 'UNAUTHORIZED');
    }
    const actor = await verifyFirebaseIdToken(authorization.slice(7).trim());
    const fecha = requestedDate(req.query);
    const token = await serviceAccessToken(serviceAccount());
    const [roles, accounts] = await Promise.all([
      readKey('lasala-roles-v1', token),
      readKey('lasala-users-v1', token)
    ]);

    if (!roles || !ALLOWED_ROLES.has(roles[actor]) || !validHash(accounts && accounts[actor])) {
      throw httpError(403, 'FORBIDDEN');
    }

    const snapshot = await readSnapshot(fecha, token);
    if (snapshot == null) throw httpError(404, 'GS_SNAPSHOT_NOT_FOUND');
    const valid = validateSnapshot(snapshot, fecha);

    return res.status(200).json({
      metadata: valid.metadata,
      lineas: valid.lineas
    });
  } catch (error) {
    const status = Number.isInteger(error && error.httpStatus) ? error.httpStatus : 503;
    const code = typeof (error && error.code) === 'string' ? error.code : 'SERVICE_UNAVAILABLE';
    if (status >= 500) console.error('gs-carga-v1:', code);
    return res.status(status).json({ error: code });
  }
};

module.exports._test = { isISODate, requestedDate, validateSnapshot };
