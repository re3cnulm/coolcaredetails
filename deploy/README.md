# Deploy: Hostinger VPS runbook

nginx → Node/Express (pm2) → Postgres, all on one Ubuntu VPS. Run these once on
a fresh Hostinger VPS as a sudo user. Placeholders in `ALL_CAPS` are things
you fill in as you go.

## 1. System basics

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx postgresql git curl ufw
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw --force enable
```

## 2. Node 20 + pm2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node -v   # should show v20.x
```

## 3. Postgres database

Postgres installs a `postgres` superuser you can `sudo -u` into to run
one-off admin SQL:

```bash
sudo -u postgres psql <<'SQL'
CREATE USER coolcare WITH PASSWORD 'PICK_A_STRONG_ONE';
CREATE DATABASE coolcaredetails OWNER coolcare;
GRANT ALL PRIVILEGES ON DATABASE coolcaredetails TO coolcare;
SQL
```

Connection string for the app:
`postgres://coolcare:PICK_A_STRONG_ONE@localhost:5432/coolcaredetails`

The schema builds itself the first time the app hits the database — nothing
to migrate by hand.

## 4. Clone + install

```bash
sudo mkdir -p /var/www /var/log/coolcaredetails
sudo chown -R "$USER":"$USER" /var/www /var/log/coolcaredetails
cd /var/www
git clone https://github.com/re3cnulm/coolcaredetails.git
cd coolcaredetails
npm ci --omit=dev
```

## 5. Environment file

```bash
cat > /var/www/coolcaredetails/.env <<'ENV'
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DATABASE_URL=postgres://coolcare:PICK_A_STRONG_ONE@localhost:5432/coolcaredetails
CRM_PASSWORD=rmyba-5t6w5-u85xr-42yk9
CRM_SESSION_SECRET=CHANGE_ME_LONG_RANDOM_STRING
ENV
chmod 600 /var/www/coolcaredetails/.env
```

Generate a random session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 6. Start under pm2

```bash
cd /var/www/coolcaredetails
pm2 start ecosystem.config.js
pm2 save
pm2 startup            # prints one command — copy/paste and run it as sudo
pm2 status             # coolcaredetails should be "online"
curl http://127.0.0.1:3000/api/health   # JSON with functionsRunning:true
```

## 7. nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/coolcaredetails.conf
sudo ln -s /etc/nginx/sites-available/coolcaredetails.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Site is now reachable at `http://YOUR_VPS_IP` — try it in a browser.

## 8. DNS (at the domain registrar)

Set two `A` records for `coolcaredetails.com`:

| Host | Type | Value        | TTL       |
| ---- | ---- | ------------ | --------- |
| `@`  | A    | YOUR_VPS_IP  | 300–3600  |
| `www`| A    | YOUR_VPS_IP  | 300–3600  |

Then wait for propagation (usually minutes; occasionally longer). Check:

```bash
dig +short coolcaredetails.com    # should return your VPS IP
```

## 9. HTTPS

Once DNS resolves to the VPS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d coolcaredetails.com -d www.coolcaredetails.com
```

Choose "redirect HTTP → HTTPS" when it asks. Renewal is automatic (a systemd
timer runs `certbot renew` twice a day).

## 10. Nightly backup

```bash
sudo mkdir -p /var/backups/coolcaredetails
sudo tee /etc/cron.daily/coolcaredetails-backup >/dev/null <<'CRON'
#!/bin/sh
DEST=/var/backups/coolcaredetails
sudo -u postgres pg_dump coolcaredetails | gzip > "$DEST/ccd-$(date +%F).sql.gz"
find "$DEST" -name 'ccd-*.sql.gz' -mtime +14 -delete
CRON
sudo chmod +x /etc/cron.daily/coolcaredetails-backup
```

## Verifying the whole thing

```bash
curl -I https://coolcaredetails.com                  # HTTP/2 200
curl -s https://coolcaredetails.com/api/health       # {"ok":true,"storage":"postgres","databaseConnected":true,...}
```

Then in a browser:

1. Submit a test booking on the homepage — should show the "Request sent" screen.
2. Visit `/crm`, sign in with `CRM_PASSWORD`, see the booking in the pipeline.
3. Schedule it, then reload — it must still be there (proves persistence).
4. `sudo reboot`, wait a minute, hit the site again — it should come back up on
   its own via pm2 + nginx.

## Deploying updates

Every future change is:

```bash
cd /var/www/coolcaredetails
git pull
npm ci --omit=dev
pm2 reload coolcaredetails
```

`pm2 reload` swaps the process with zero-downtime.

## Rolling back

```bash
cd /var/www/coolcaredetails
git log --oneline -5
git checkout <GOOD_COMMIT_SHA>
npm ci --omit=dev
pm2 reload coolcaredetails
```

## Troubleshooting

- **502 Bad Gateway** — the Node app is down. `pm2 status` / `pm2 logs coolcaredetails`.
- **Database errors on `/api/health`** — check `DATABASE_URL` in `.env`, then `sudo systemctl status postgresql`.
- **Site loads over HTTP but not HTTPS** — DNS hasn't propagated yet, or certbot hasn't run.
- **Change env vars** — edit `.env`, then `pm2 reload coolcaredetails` (a plain `pm2 restart` also picks them up).
