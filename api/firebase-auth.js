const crypto = require('node:crypto');

const EXPECTED_PROJECT = 'la-sala-app-test';
const DATABASE_URL = 'https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const USERS_KEY = 'lasala-users-v1';
const ROLES_KEY = 'lasala-roles-v1';
const TOKEN_AUD = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_SCOPE = 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';

let cachedAccessToken = null;
let cachedAccessTokenUntil = 0;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signJwt(serviceAccount, payload) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const unsigned = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(payload));
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), serviceAccount.private_key);
  return unsigned + '.' + signature.toString('base64url');
}

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no configurado');
  const sa = JSON.parse(raw);
  if (sa.project_id !== EXPECTED_PROJECT) {
    throw new Error('Cuenta de servicio de proyecto incorrecto');
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('Cuenta de servicio incompleta');
  }
  return sa;
}

async function getGoogleAccessToken(sa) {
  if (cachedAccessToken && Date.now() < cachedAccessTokenUntil) return cachedAccessToken;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(sa, {
    iss: sa.client_email,
    scope: OAUTH_SCOPE,
    aud: OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600
  });
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const r = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!r.ok) throw new Error('OAuth Google HTTP ' + r.status);
  const j = await r.json();
  if (!j.access_token) throw new Error('OAuth Google sin access_token');
  cachedAccessToken = j.access_token;
  cachedAccessTokenUntil = Date.now() + Math.max(60, (Number(j.expires_in) || 3600) - 120) * 1000;
  return cachedAccessToken;
}

function parseStoredJson(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_) { return null; }
  }
  return value;
}

async function readRtdbKey(key, accessToken) {
  const r = await fetch(DATABASE_URL + '/' + encodeURIComponent(key) + '.json', {
    headers: { Authorization: 'Bearer ' + accessToken },
    cache: 'no-store'
  });
  if (!r.ok) throw new Error('RTDB ' + key + ' HTTP ' + r.status);
  return parseStoredJson(await r.json());
}

function validPasswordHash(password, expectedHash) {
  const expected = String(expectedHash || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) return false;
  const actual = crypto.createHash('sha256').update(password, 'utf8').digest();
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function uidForUser(user) {
  return 'lasala-' + crypto.createHash('sha256').update(user, 'utf8').digest('hex').slice(0, 40);
}

function createFirebaseCustomToken(sa, user, role) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(sa, {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: TOKEN_AUD,
    iat: now,
    exp: now + 3600,
    uid: uidForUser(user),
    claims: {
      appUser: user,
      role: role || 'SIN_ROL'
    }
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    let configured = false;
    let projectOk = false;
    try {
      const sa = getServiceAccount();
      configured = true;
      projectOk = sa.project_id === EXPECTED_PROJECT;
    } catch (_) {}
    return res.status(200).json({ configured, projectOk });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = null; }
  }

  const user = String(body && body.user || '').trim().toUpperCase();
  const password = String(body && body.password || '');

  if (!user || user.length > 80 || !password || password.length > 256) {
    return res.status(400).json({ error: 'INVALID_CREDENTIALS' });
  }

  try {
    const sa = getServiceAccount();
    const accessToken = await getGoogleAccessToken(sa);
    const [users, roles] = await Promise.all([
      readRtdbKey(USERS_KEY, accessToken),
      readRtdbKey(ROLES_KEY, accessToken)
    ]);

    if (!users || typeof users !== 'object' || !validPasswordHash(password, users[user])) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    const role = roles && typeof roles === 'object' && typeof roles[user] === 'string'
      ? roles[user]
      : null;

    return res.status(200).json({
      customToken: createFirebaseCustomToken(sa, user, role),
      user,
      role
    });
  } catch (err) {
    console.error('firebase-auth error:', err && err.message ? err.message : err);
    return res.status(503).json({ error: 'AUTH_SERVICE_UNAVAILABLE' });
  }
};
