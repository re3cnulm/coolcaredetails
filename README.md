# Coolcare Details

Website, booking system and staff CRM for Coolcare Details — mobile auto detailing in Las Vegas.

Deployed on Vercel from this repository. Pushing to `main` publishes to production;
pushing any other branch creates a preview deployment.

## Layout

```
public/            static site (this is what visitors see)
  index.html         homepage — packages, pricing, booking form
  crm.html           staff CRM (leads, schedule, invoices)
  style.css          public site styles
  assets/
    pricing.js       shared service catalogue + quote math (browser + server)
    booking.js       booking form behaviour
    crm.js           CRM application
    crm.css          CRM styles
  images/
    logo.webp        brand artwork used site-wide (PNG fallback alongside)
    logo.png         same artwork, full quality
    favicon.png      tab icon / touch icon
api/               Vercel serverless functions
  auth.js            sign in / sign out / session check
  bookings.js        POST is public (the booking form); GET/PATCH/DELETE need a session
  invoices.js        invoice CRUD, all authenticated
lib/               server-only helpers (never served to the browser)
  store.js           Postgres persistence with an in-memory fallback
  auth.js            password check and signed session cookie
  http.js            booking validation and optional email alerts
  pricing.js         re-exports the shared catalogue
```

## Required setup

Both steps are done in the Vercel dashboard for this project.

### 1. Set the CRM password

**Settings → Environment Variables**, add:

| Name | Value |
| --- | --- |
| `CRM_PASSWORD` | the password you'll use to sign in at `/crm` |

Until this is set the CRM login page says it isn't configured, and nobody can sign in.
Redeploy after adding it so the functions pick it up.

### 2. Connect a database

**Storage → Create Database → Neon Postgres**, then connect it to this project. Vercel
injects `DATABASE_URL` automatically and the tables create themselves on the next request.

Without a database the site still runs, but bookings are held in memory and vanish when the
serverless instance recycles. The CRM shows a warning banner whenever that's the case.

## Optional setup

| Variable | Effect |
| --- | --- |
| `CRM_SESSION_SECRET` | Signs session cookies. Defaults to `CRM_PASSWORD`; setting it separately means changing the password doesn't have to invalidate sessions. |
| `RESEND_API_KEY` + `NOTIFY_EMAIL` | Emails you every new booking. Get the key at resend.com. |
| `NOTIFY_FROM` | Sender for those alerts. Defaults to Resend's shared onboarding address; use your own verified domain in production. |

## How it fits together

A customer picks a vehicle size, package and add-ons on the homepage and sees a live
estimate. Submitting posts to `/api/bookings`, which validates the request, re-computes the
quote server-side (so the price can't be tampered with) and stores it as a lead.

Staff sign in at `/crm` and see every lead in the pipeline. Opening one lets you edit the
customer and service details, set a status, and give it an appointment date and time — which
places it on the Schedule calendar. "Create invoice" carries the job's line items straight
into a new invoice, where you can adjust items, tax and discount, mark it paid, and print to
PDF from the browser.

Prices live in one place, `public/assets/pricing.js`. Edit them there and the booking form,
the CRM and invoice defaults all follow.

## Local development

There's no build step. Serve `public/` with any static server for design work.
To exercise the API you need a runtime that mirrors Vercel's function signature —
`vercel dev` (from the Vercel CLI) is the closest match:

```bash
npm install
CRM_PASSWORD=localdev vercel dev
```
