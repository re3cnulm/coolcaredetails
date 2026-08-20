const crypto = require('crypto');

/*
 * Storage for bookings and invoices.
 *
 * With a Postgres connection string in the environment (DATABASE_URL or
 * POSTGRES_URL — Vercel injects one automatically when you attach a Neon /
 * Postgres store to the project) everything is persisted and the schema is
 * created on first use.
 *
 * Without one the app still runs on an in-memory store so the site never
 * errors, but rows only live as long as a single serverless instance. The API
 * reports which mode is active so the CRM can warn about it.
 */

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  '';

const hasDatabase = Boolean(CONNECTION_STRING);

let pool = null;
let schemaReady = null;

function getPool() {
  if (!hasDatabase) return null;
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: CONNECTION_STRING,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000
    });
  }
  return pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bookings (
  id             TEXT PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT,
  vehicle        TEXT,
  vehicle_desc   TEXT,
  package_id     TEXT,
  addons         JSONB NOT NULL DEFAULT '[]'::jsonb,
  address        TEXT,
  preferred_date DATE,
  preferred_time TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'new',
  scheduled_at   TIMESTAMPTZ,
  duration_min   INTEGER DEFAULT 120,
  quote          NUMERIC(10,2),
  crm_notes      TEXT,
  source         TEXT DEFAULT 'website'
);
CREATE INDEX IF NOT EXISTS bookings_created_idx ON bookings (created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_scheduled_idx ON bookings (scheduled_at);

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1001;

CREATE TABLE IF NOT EXISTS invoices (
  id               TEXT PRIMARY KEY,
  number           INTEGER NOT NULL DEFAULT nextval('invoice_number_seq'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  booking_id       TEXT,
  customer_name    TEXT,
  customer_phone   TEXT,
  customer_email   TEXT,
  customer_address TEXT,
  items            JSONB NOT NULL DEFAULT '[]'::jsonb,
  tax_rate         NUMERIC(6,3) NOT NULL DEFAULT 0,
  discount         NUMERIC(10,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'draft',
  issue_date       DATE,
  due_date         DATE,
  paid_date        DATE,
  notes            TEXT
);
CREATE INDEX IF NOT EXISTS invoices_created_idx ON invoices (created_at DESC);
`;

function ensureSchema() {
  if (!hasDatabase) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA)
      .catch((err) => {
        schemaReady = null; // let the next request retry
        throw err;
      });
  }
  return schemaReady;
}

async function query(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}

function newId() {
  return crypto.randomUUID();
}

/* ---------------------------------------------------------------- memory -- */

const memory = { bookings: [], invoices: [], nextInvoiceNumber: 1001 };

/* ------------------------------------------------------------- row shape -- */

function bookingFromRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    phone: row.phone,
    email: row.email,
    vehicle: row.vehicle,
    vehicleDesc: row.vehicle_desc,
    package: row.package_id,
    addons: row.addons || [],
    address: row.address,
    preferredDate: row.preferred_date,
    preferredTime: row.preferred_time,
    notes: row.notes,
    status: row.status,
    scheduledAt: row.scheduled_at,
    durationMin: row.duration_min,
    quote: row.quote == null ? null : Number(row.quote),
    crmNotes: row.crm_notes,
    source: row.source
  };
}

function invoiceFromRow(row) {
  return {
    id: row.id,
    number: row.number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bookingId: row.booking_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    customerAddress: row.customer_address,
    items: row.items || [],
    taxRate: Number(row.tax_rate || 0),
    discount: Number(row.discount || 0),
    status: row.status,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    paidDate: row.paid_date,
    notes: row.notes
  };
}

// Maps API field names onto database columns for partial updates.
const BOOKING_COLUMNS = {
  name: 'name',
  phone: 'phone',
  email: 'email',
  vehicle: 'vehicle',
  vehicleDesc: 'vehicle_desc',
  package: 'package_id',
  addons: 'addons',
  address: 'address',
  preferredDate: 'preferred_date',
  preferredTime: 'preferred_time',
  notes: 'notes',
  status: 'status',
  scheduledAt: 'scheduled_at',
  durationMin: 'duration_min',
  quote: 'quote',
  crmNotes: 'crm_notes',
  source: 'source'
};

const INVOICE_COLUMNS = {
  bookingId: 'booking_id',
  customerName: 'customer_name',
  customerPhone: 'customer_phone',
  customerEmail: 'customer_email',
  customerAddress: 'customer_address',
  items: 'items',
  taxRate: 'tax_rate',
  discount: 'discount',
  status: 'status',
  issueDate: 'issue_date',
  dueDate: 'due_date',
  paidDate: 'paid_date',
  notes: 'notes'
};

function serialise(column, value) {
  if (column === 'addons' || column === 'items') return JSON.stringify(value || []);
  if (value === '') return null;
  return value;
}

/* ------------------------------------------------------------- bookings -- */

async function listBookings() {
  if (!hasDatabase) {
    return memory.bookings.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  const { rows } = await query('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 1000');
  return rows.map(bookingFromRow);
}

async function createBooking(data) {
  const record = {
    id: newId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: data.name,
    phone: data.phone,
    email: data.email || null,
    vehicle: data.vehicle || null,
    vehicleDesc: data.vehicleDesc || null,
    package: data.package || null,
    addons: data.addons || [],
    address: data.address || null,
    preferredDate: data.preferredDate || null,
    preferredTime: data.preferredTime || null,
    notes: data.notes || null,
    status: data.status || 'new',
    scheduledAt: data.scheduledAt || null,
    durationMin: data.durationMin || 120,
    quote: data.quote == null ? null : Number(data.quote),
    crmNotes: null,
    source: data.source || 'website'
  };

  if (!hasDatabase) {
    memory.bookings.unshift(record);
    return record;
  }

  const { rows } = await query(
    `INSERT INTO bookings
       (id, name, phone, email, vehicle, vehicle_desc, package_id, addons, address,
        preferred_date, preferred_time, notes, status, scheduled_at, duration_min, quote, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      record.id, record.name, record.phone, record.email, record.vehicle, record.vehicleDesc,
      record.package, JSON.stringify(record.addons), record.address, record.preferredDate,
      record.preferredTime, record.notes, record.status, record.scheduledAt,
      record.durationMin, record.quote, record.source
    ]
  );
  return bookingFromRow(rows[0]);
}

async function updateBooking(id, patch) {
  if (!hasDatabase) {
    const found = memory.bookings.find((b) => b.id === id);
    if (!found) return null;
    Object.keys(patch).forEach((key) => {
      if (key in BOOKING_COLUMNS) found[key] = patch[key];
    });
    found.updatedAt = new Date().toISOString();
    return found;
  }

  const sets = [];
  const values = [];
  Object.keys(patch).forEach((key) => {
    const column = BOOKING_COLUMNS[key];
    if (!column) return;
    values.push(serialise(column, patch[key]));
    sets.push(`${column} = $${values.length}${column === 'addons' ? '::jsonb' : ''}`);
  });
  if (!sets.length) {
    const existing = await query('SELECT * FROM bookings WHERE id = $1', [id]);
    return existing.rows[0] ? bookingFromRow(existing.rows[0]) : null;
  }
  values.push(id);
  const { rows } = await query(
    `UPDATE bookings SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values
  );
  return rows[0] ? bookingFromRow(rows[0]) : null;
}

async function deleteBooking(id) {
  if (!hasDatabase) {
    const before = memory.bookings.length;
    memory.bookings = memory.bookings.filter((b) => b.id !== id);
    return memory.bookings.length < before;
  }
  const { rowCount } = await query('DELETE FROM bookings WHERE id = $1', [id]);
  return rowCount > 0;
}

/* ------------------------------------------------------------- invoices -- */

async function listInvoices() {
  if (!hasDatabase) {
    return memory.invoices.slice().sort((a, b) => b.number - a.number);
  }
  const { rows } = await query('SELECT * FROM invoices ORDER BY number DESC LIMIT 1000');
  return rows.map(invoiceFromRow);
}

async function createInvoice(data) {
  const today = new Date().toISOString().slice(0, 10);
  const base = {
    bookingId: data.bookingId || null,
    customerName: data.customerName || '',
    customerPhone: data.customerPhone || '',
    customerEmail: data.customerEmail || '',
    customerAddress: data.customerAddress || '',
    items: data.items || [],
    taxRate: Number(data.taxRate || 0),
    discount: Number(data.discount || 0),
    status: data.status || 'draft',
    issueDate: data.issueDate || today,
    dueDate: data.dueDate || null,
    paidDate: data.paidDate || null,
    notes: data.notes || null
  };

  if (!hasDatabase) {
    const record = Object.assign({
      id: newId(),
      number: memory.nextInvoiceNumber++,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, base);
    memory.invoices.unshift(record);
    return record;
  }

  const { rows } = await query(
    `INSERT INTO invoices
       (id, booking_id, customer_name, customer_phone, customer_email, customer_address,
        items, tax_rate, discount, status, issue_date, due_date, paid_date, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      newId(), base.bookingId, base.customerName, base.customerPhone, base.customerEmail,
      base.customerAddress, JSON.stringify(base.items), base.taxRate, base.discount,
      base.status, base.issueDate, base.dueDate, base.paidDate, base.notes
    ]
  );
  return invoiceFromRow(rows[0]);
}

async function updateInvoice(id, patch) {
  if (!hasDatabase) {
    const found = memory.invoices.find((i) => i.id === id);
    if (!found) return null;
    Object.keys(patch).forEach((key) => {
      if (key in INVOICE_COLUMNS) found[key] = patch[key];
    });
    found.updatedAt = new Date().toISOString();
    return found;
  }

  const sets = [];
  const values = [];
  Object.keys(patch).forEach((key) => {
    const column = INVOICE_COLUMNS[key];
    if (!column) return;
    values.push(serialise(column, patch[key]));
    sets.push(`${column} = $${values.length}${column === 'items' ? '::jsonb' : ''}`);
  });
  if (!sets.length) {
    const existing = await query('SELECT * FROM invoices WHERE id = $1', [id]);
    return existing.rows[0] ? invoiceFromRow(existing.rows[0]) : null;
  }
  values.push(id);
  const { rows } = await query(
    `UPDATE invoices SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values
  );
  return rows[0] ? invoiceFromRow(rows[0]) : null;
}

async function deleteInvoice(id) {
  if (!hasDatabase) {
    const before = memory.invoices.length;
    memory.invoices = memory.invoices.filter((i) => i.id !== id);
    return memory.invoices.length < before;
  }
  const { rowCount } = await query('DELETE FROM invoices WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = {
  storageMode: () => (hasDatabase ? 'postgres' : 'memory'),
  listBookings,
  createBooking,
  updateBooking,
  deleteBooking,
  listInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice
};
