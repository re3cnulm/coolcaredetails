const auth = require('../lib/auth');
const store = require('../lib/store');

// Light brute-force guard. Per-instance only, which is enough friction for a
// single-operator CRM sitting behind a shared password.
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

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
  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        authenticated: await auth.isAuthenticated(req),
        configured: await auth.isConfigured(),
        canChangePassword: store.hasDatabase
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = req.body || {};

    /* ------------------------------------------------------------ logout -- */
    if (body.action === 'logout') {
      auth.clearSessionCookie(res);
      return res.status(200).json({ authenticated: false });
    }

    /* --------------------------------------------------- change password -- */
    if (body.action === 'change-password') {
      if (!(await auth.requireAuth(req, res))) return undefined;

      // A new password has to outlive the request, which needs real storage.
      if (!store.hasDatabase) {
        return res.status(503).json({
          error: 'Connect a database first — without one a new password would be lost on the next request. ' +
                 'In Vercel: Storage → Create Database → Neon Postgres.'
        });
      }

      const check = await auth.checkPassword(body.currentPassword);
      if (!check.ok) {
        recordFailure(clientIp(req));
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }

      const problem = auth.passwordProblem(body.newPassword);
      if (problem) return res.status(400).json({ error: problem });

      if (body.newPassword === body.currentPassword) {
        return res.status(400).json({ error: 'That is already your current password.' });
      }

      await auth.setPassword(body.newPassword);

      // The change retires every existing cookie, so mint a fresh one for the
      // browser that made the change — other devices are signed out.
      auth.setSessionCookie(res, await auth.createToken());

      return res.status(200).json({
        ok: true,
        envStillValid: Boolean(process.env.CRM_PASSWORD)
      });
    }

    /* ------------------------------------------------------------- login -- */
    if (!(await auth.isConfigured())) {
      return res.status(503).json({
        error: 'CRM is not configured yet. Set a CRM_PASSWORD environment variable in Vercel, then redeploy.',
        configured: false
      });
    }

    const ip = clientIp(req);
    if (tooManyAttempts(ip)) {
      return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    }

    const result = await auth.checkPassword(body.password);
    if (!result.ok) {
      recordFailure(ip);
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    attempts.delete(ip);
    auth.setSessionCookie(res, await auth.createToken());
    return res.status(200).json({ authenticated: true });
  } catch (err) {
    console.error('auth error:', err);
    return res.status(500).json({ error: 'Sign-in is temporarily unavailable.' });
  }
};
