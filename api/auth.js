const auth = require('../lib/auth');

// Light brute-force guard. Per-instance only, which is enough friction for a
// single-operator CRM sitting behind a shared password.
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function tooManyAttempts(ip) {
  const record = attempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.first > WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const record = attempts.get(ip);
  if (!record || Date.now() - record.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: Date.now() });
  } else {
    record.count += 1;
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({
      authenticated: auth.isAuthenticated(req),
      configured: auth.isConfigured()
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  if (body.action === 'logout') {
    auth.clearSessionCookie(res);
    return res.status(200).json({ authenticated: false });
  }

  if (!auth.isConfigured()) {
    return res.status(503).json({
      error: 'CRM is not configured yet. Set a CRM_PASSWORD environment variable in Vercel, then redeploy.',
      configured: false
    });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }

  if (!auth.checkPassword(body.password)) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  attempts.delete(ip);
  auth.setSessionCookie(res, auth.createToken());
  return res.status(200).json({ authenticated: true });
};
