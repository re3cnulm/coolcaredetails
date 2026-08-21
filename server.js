/*
 * Coolcare Details — production Express server for a VPS.
 *
 * Serves the static site under public/ and mounts every api/<name>.js as
 * /api/<name>. The api handlers were written to Vercel's (req, res) signature,
 * which Express accepts as-is — this file exists so the same code runs on any
 * Node host without touching a single handler.
 *
 * nginx sits in front of this process and terminates TLS; we listen on
 * 127.0.0.1 only, so the app is never exposed to the public internet directly.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

// Load .env if present. Intentionally not a dependency — we parse the minimum
// ourselves so the deploy has zero extra install steps.
loadDotEnv(path.join(__dirname, '.env'));

const PUBLIC_DIR = path.join(__dirname, 'public');
const API_DIR = path.join(__dirname, 'api');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback'); // honour X-Forwarded-For from local nginx

app.use(express.json({ limit: '256kb' }));

/* ------------------------------------------------------------------ api -- */

// /api/* must never be cached — the browser always sees fresh booking + auth
// state. Mirrors the header vercel.json set on Vercel.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Auto-mount every api/*.js so adding a new endpoint is one file, no wiring.
for (const file of fs.readdirSync(API_DIR)) {
  if (!file.endsWith('.js')) continue;
  const name = file.slice(0, -3);
  const handler = require(path.join(API_DIR, file));
  app.all('/api/' + name, (req, res) => handler(req, res));
}

/* -------------------------------------------------------------- statics -- */

// Match Vercel's cleanUrls behaviour: /about → public/about.html, and a
// trailing slash on a non-directory path redirects to the clean form.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const url = req.path;

  // /foo/ → /foo (except for the root)
  if (url.length > 1 && url.endsWith('/')) {
    return res.redirect(301, url.replace(/\/+$/, ''));
  }

  // /foo → public/foo.html if that file exists and there's no extension
  if (url !== '/' && !path.extname(url)) {
    const htmlPath = path.join(PUBLIC_DIR, url + '.html');
    if (isSafePath(htmlPath) && fs.existsSync(htmlPath)) {
      return res.sendFile(htmlPath);
    }
  }
  next();
});

app.use(express.static(PUBLIC_DIR, {
  extensions: ['html'],
  index: 'index.html',
  setHeaders(res, filePath) {
    // Long cache for versioned-looking assets (images, videos, fonts); short
    // for HTML/CSS/JS so a git pull + pm2 reload actually shows up quickly.
    const ext = path.extname(filePath).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.mp4', '.woff', '.woff2'].includes(ext)) {
      res.set('Cache-Control', 'public, max-age=604800'); // 7 days
    } else {
      res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
    }
  }
}));

// Explicit 404 rather than express default, so bots see a proper miss.
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
    if (err) res.status(404).type('text').send('Not found');
  });
});

app.listen(PORT, HOST, () => {
  console.log(`coolcaredetails listening on http://${HOST}:${PORT}`);
});

/* --------------------------------------------------------------- utils -- */

function isSafePath(candidate) {
  const resolved = path.resolve(candidate);
  return resolved.startsWith(path.resolve(PUBLIC_DIR) + path.sep);
}

// Minimal .env loader: KEY=value per line, # comments, ignores blanks.
// Values may be wrapped in single or double quotes. Existing env vars win.
function loadDotEnv(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
