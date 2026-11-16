'use strict';

// Todas las escrituras de Tareas pasan por este endpoint. Las reglas RTDB
// bloquean la escritura directa del cliente; aquí se valida token, usuario,
// rol vigente, ETag y cambios permitidos antes del PUT con cuenta de servicio.
const {
  verifyFirebaseIdToken, serviceAccount, serviceAccessToken, readKey,
  validHash, httpError
} = require('../api/admin-users')._adminCatalogHelpers;
const { validateTaskWrite } = require('./tasks-write-policy');

const DB = 'https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const TASKS_KEY = 'lasala-tareas-v1';
const ROLES_KEY = 'lasala-roles-v1';
const USERS_KEY = 'lasala-users-v1';

function tasksUrl() { return DB + '/' + encodeURIComponent(TASKS_KEY) + '.json'; }
function bodyOf(req) {
  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (_) { throw httpError(400, 'INVALID_BODY'); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw httpError(400, 'INVALID_BODY');
  return data;
}
function decodeTasks(raw) {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (_) { throw httpError(503, 'INVALID_TASKS_DATA'); }
  }
  if (!Array.isArray(raw)) throw httpError(503, 'INVALID_TASKS_DATA');
  return raw;
}

module.exports = async function tasksWrite(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'UNAUTHORIZED' });
  try {
    const input = bodyOf(req);
    if (typeof input.expectedEtag !== 'string' || input.expectedEtag.length > 256 || !Array.isArray(input.value))
      throw httpError(400, 'INVALID_BODY');
    const actor = await verifyFirebaseIdToken(authorization.slice(7).trim());
    const sa = serviceAccount();
    const serviceToken = await serviceAccessToken(sa);
    const [roles, users] = await Promise.all([
      readKey(ROLES_KEY, serviceToken), readKey(USERS_KEY, serviceToken)
    ]);
    const role = roles[actor];
    if (!validHash(users[actor]) || !['ADMIN', 'TECNICO', 'PEON', 'REGANTE'].includes(role))
      throw httpError(403, 'FORBIDDEN');

    const current = await fetch(tasksUrl(), {
      headers: { Authorization: 'Bearer ' + serviceToken, 'X-Firebase-ETag': 'true' },
      cache: 'no-store', signal: AbortSignal.timeout(10000)
    });
    if (!current.ok) throw new Error('No se pueden leer las tareas');
    const etag = current.headers.get('ETag');
    if (!etag) throw new Error('Firebase no devolvió ETag');
    if (etag !== input.expectedEtag) throw httpError(409, 'CONCURRENT_MODIFICATION');
    const before = decodeTasks(await current.json());
    validateTaskWrite({ before, after: input.value, actor, role, roles });

    const saved = await fetch(tasksUrl() + '?print=silent', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + serviceToken,
        'Content-Type': 'application/json',
        'if-match': etag
      },
      body: JSON.stringify(JSON.stringify(input.value)),
      signal: AbortSignal.timeout(10000)
    });
    if (saved.status === 412) throw httpError(409, 'CONCURRENT_MODIFICATION');
    if (!saved.ok) throw new Error('No se pudieron guardar las tareas');
    return res.status(200).json({ ok: true, value: input.value });
  } catch (err) {
    const status = err.httpStatus || 503;
    if (status === 503) console.error('tasks-write TEST:', err.message);
    return res.status(status).json({ error: status === 503 ? 'SERVICE_UNAVAILABLE' : err.code });
  }
};
