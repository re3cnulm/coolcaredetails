const crypto = require('crypto');

const COOKIE_NAME = 'ccd_session';
const SESSION_HOURS = 168; // 7 days

function sessionSecret() {
  return process.env.CRM_SESSION_SECRET || process.env.CRM_PASSWORD || '';
}

function isConfigured() {
  return Boolean(process.env.CRM_PASSWORD);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

// Hashing both sides first keeps the comparison constant-time regardless of length.
function checkPassword(input) {
  if (!isConfigured() || typeof input !== 'string') return false;
  return crypto.timingSafeEqual(sha256(input), sha256(process.env.CRM_PASSWORD));
}

function sign(payload) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

function createToken() {
  const expires = String(Date.now() + SESSION_HOURS * 3600 * 1000);
  return expires + '.' + sign(expires);
}

function verifyToken(token) {
  if (!token || !isConfigured()) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  const [expires, signature] = parts;
  const expected = Buffer.from(sign(expires));
  const given = Buffer.from(signature);
  if (given.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(given, expected)) return false;
  return Number(expires) > Date.now();
}

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

// Guard for every CRM endpoint. Returns false once it has written the response.
function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  res.status(401).json({ error: 'Not signed in' });
  return false;
}

module.exports = {
  COOKIE_NAME,
  isConfigured,
  checkPassword,
  createToken,
  verifyToken,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  isAuthenticated,
  requireAuth
};
