const CCD = require('./pricing');

function clean(value, maxLength) {
  if (value == null) return '';
  return String(value).trim().slice(0, maxLength);
}

function isOneOf(value, list) {
  return list.some((entry) => entry.id === value);
}

/* Validates a booking submitted from the public form. Returns
   { ok: true, value } or { ok: false, errors: [...] }. */
function validateBooking(body) {
  const errors = [];
  const data = {
    name: clean(body.name, 120),
    phone: clean(body.phone, 40),
    email: clean(body.email, 160),
    vehicle: clean(body.vehicle, 20),
    vehicleDesc: clean(body.vehicleDesc, 120),
    package: clean(body.package, 20),
    addons: Array.isArray(body.addons) ? body.addons.slice(0, 20).map((a) => clean(a, 40)) : [],
    address: clean(body.address, 240),
    preferredDate: clean(body.preferredDate, 10),
    preferredTime: clean(body.preferredTime, 40),
    notes: clean(body.notes, 2000)
  };

  if (data.name.length < 2) errors.push('Please enter your name.');

  const digits = data.phone.replace(/\D/g, '');
  if (digits.length < 10) errors.push('Please enter a valid phone number.');

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Please enter a valid email address, or leave it blank.');
  }
  if (!isOneOf(data.vehicle, CCD.VEHICLES)) errors.push('Please choose a vehicle size.');
  if (!isOneOf(data.package, CCD.PACKAGES)) errors.push('Please choose a package.');

  data.addons = data.addons.filter((id) => isOneOf(id, CCD.ADDONS));

  if (data.preferredDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.preferredDate)) {
    data.preferredDate = '';
  }

  if (errors.length) return { ok: false, errors };

  data.quote = CCD.quote(data.vehicle, data.package, data.addons).total;
  return { ok: true, value: data };
}

/* Optional email alert for a new lead. No-ops unless RESEND_API_KEY and
   NOTIFY_EMAIL are configured, and never blocks the customer's response. */
async function notifyNewBooking(booking) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!key || !to) return;

  const quote = CCD.quote(booking.vehicle, booking.package, booking.addons);
  const lines = quote.lines.map((l) => `<li>${l.description} — ${CCD.money(l.total)}</li>`).join('');

  const html = `
    <h2>New booking request</h2>
    <p><strong>${booking.name}</strong><br>
    <a href="tel:${booking.phone}">${booking.phone}</a>
    ${booking.email ? `<br>${booking.email}` : ''}</p>
    <p><strong>Vehicle:</strong> ${CCD.vehicleLabel(booking.vehicle)}
    ${booking.vehicleDesc ? ` (${booking.vehicleDesc})` : ''}<br>
    <strong>Package:</strong> ${CCD.packageLabel(booking.package)}</p>
    <ul>${lines}</ul>
    <p><strong>Estimate:</strong> ${CCD.money(quote.total)}</p>
    ${booking.address ? `<p><strong>Address:</strong> ${booking.address}</p>` : ''}
    ${booking.preferredDate ? `<p><strong>Preferred:</strong> ${booking.preferredDate} ${booking.preferredTime || ''}</p>` : ''}
    ${booking.notes ? `<p><strong>Notes:</strong> ${booking.notes}</p>` : ''}
  `;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM || 'Coolcare Details <onboarding@resend.dev>',
        to: [to],
        subject: `New booking — ${booking.name} (${CCD.money(quote.total)})`,
        html
      })
    });
  } catch (err) {
    console.error('Lead notification failed:', err.message);
  }
}

module.exports = { clean, validateBooking, notifyNewBooking };
