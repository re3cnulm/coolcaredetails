const crypto = require('crypto');
const store = require('./store');

/*
 * CRM authentication.
 *
 * The password comes from one of two places:
 *   1. A scrypt hash stored in the database, once it has been changed in the
 *      CRM. This always wins.
 *   2. The CRM_PASSWORD environment variable, which bootstraps the first
 *      sign-in and remains the recovery route if the stored password is lost.
 *
 * Sessions are stateless: a cookie carries an expiry plus an "epoch", signed
 * with an HMAC. Changing the password bumps the epoch, which invalidates every
 * cookie issued before it — so a password change really does sign out any
 * other device.
 */

const COOKIE_NAME = 'ccd_session';
const SESSION_HOURS = 168; // 7 days
const PASSWORD_KEY = 'crm_password_hash';
const EPOCH_KEY = 'session_epoch';
const MIN_PASSWORD_LENGTH = 10;

function sessionSecret() {
  return process.env.CRM_SESSION_SECRET || process.env.CRM_PASSWORD || 'coolcare-unset';
}

// True when at least one credential exists, so the CRM can be signed into.
async function isConfigured() {
  if (process.env.CRM_PASSWORD) return true;
  try {
    return Boolean(await store.getSetting(PASSWORD_KEY));
  } catch (err) {
    return false;
  }
}

/* ------------------------------------------------------------- hashing --- */

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(plain), salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + derived.toString('hex');
}

function verifyHash(plain, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  let derived;
  try {
    derived = crypto.scryptSync(String(plain), salt, expected.length);
  } catch (err) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

// Hashing both sides keeps the comparison constant-time regardless of length.
function constantTimeEquals(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

/*
 * Checks a submitted password against the stored hash, falling back to the
 * environment variable. Returns { ok, source }.
 */
async function checkPassword(input) {
  if (typeof input !== 'string' || !input) return { ok: false, source: null };

  let stored = null;
  try {
    stored = await store.getSetting(PASSWORD_KEY);
  } catch (err) {
    stored = null; // database unreachable — fall through to the env var
  }

  if (stored) {
    if (verifyHash(input, stored)) return { ok: true, source: 'stored' };
    // The env var stays valid as a recovery route even after a change.
    if (process.env.CRM_PASSWORD && constantTimeEquals(input, process.env.CRM_PASSWORD)) {
      return { ok: true, source: 'env' };
    }
    return { ok: false, source: null };
  }

  if (process.env.CRM_PASSWORD && constantTimeEquals(input, process.env.CRM_PASSWORD)) {
    return { ok: true, source: 'env' };
  }
  return { ok: false, source: null };
}

/* ------------------------------------------------------------- sessions -- */

async function currentEpoch() {
  try {
    return (await store.getSetting(EPOCH_KEY)) || '0';
  } catch (err) {
    return '0';
  }
}

function sign(payload) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

async function createToken() {
  const expires = String(Date.now() + SESSION_HOURS * 3600 * 1000);
  const epoch = await currentEpoch();
  const payload = expires + '.' + epoch;
  return payload + '.' + sign(payload);
}

async function verifyToken(token) {
  if (!token) return false;
  const parts = String(token).split('.');
  if (parts.length !== 3) return false;

  const [expires, epoch, signature] = parts;
  const expected = Buffer.from(sign(expires + '.' + epoch));
  const given = Buffer.from(signature);
  if (given.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(given, expected)) return false;
  if (Number(expires) <= Date.now()) return false;

  // A password change bumps the epoch, retiring every older cookie.
  return epoch === (await currentEpoch());
}

// Called after a password change so other devices are signed out.
async function bumpEpoch() {
  return store.setSetting(EPOCH_KEY, String(Date.now()));
}

async function setPassword(plain) {
  await store.setSetting(PASSWORD_KEY, hashPassword(plain));
  await bumpEpoch();
}

function passwordProblem(plain) {
  if (typeof plain !== 'string' || plain.length < MIN_PASSWORD_LENGTH) {
    return `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (plain.length > 200) return 'That password is too long.';
  if (!/\S/.test(plain)) return 'That password is not valid.';
  return null;
}

/* -------------------------------------------------------------- cookies -- */

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function setSessionCookie(res, token) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_HOURS * 3600}`
  ];
  if (process.env.VERCEL) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function isAuthenticated(req) {
  return verifyToken(parseCookies(req)[COOKIE_NAME]);
}

// Guard for every CRM endpoint. Resolves false once it has written the response.
async function requireAuth(req, res) {
  if (await isAuthenticated(req)) return true;
  res.status(401).json({ error: 'Not signed in' });
  return false;
}

module.exports = {
  COOKIE_NAME,
  MIN_PASSWORD_LENGTH,
  isConfigured,
  checkPassword,
  setPassword,
  passwordProblem,
  createToken,
  verifyToken,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  isAuthenticated,
  requireAuth
};
