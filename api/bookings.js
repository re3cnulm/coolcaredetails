const store = require('../lib/store');
const auth = require('../lib/auth');
const { validateBooking, notifyNewBooking } = require('../lib/http');

module.exports = async (req, res) => {
  try {
    // Public: a customer submitting the booking form on the homepage.
    if (req.method === 'POST') {
      const result = validateBooking(req.body || {});
      if (!result.ok) return res.status(400).json({ error: result.errors.join(' ') });

      // The quote is always priced server-side so a customer cannot set their
      // own total; signed-in staff logging a job by phone may override it.
      if (await auth.isAuthenticated(req)) {
        const body = req.body || {};
        if (body.quote != null && body.quote !== '') result.value.quote = Number(body.quote);
        if (body.status) result.value.status = body.status;
        if (body.source) result.value.source = body.source;
        if (body.scheduledAt) result.value.scheduledAt = body.scheduledAt;
        if (body.crmNotes) result.value.crmNotes = body.crmNotes;
      }

      const booking = await store.createBooking(result.value);
      await notifyNewBooking(booking);

      return res.status(201).json({
        ok: true,
        booking: { id: booking.id, quote: booking.quote },
        persisted: store.storageMode() === 'postgres'
      });
    }

    // Everything below is CRM-only.
    if (!(await auth.requireAuth(req, res))) return undefined;

    if (req.method === 'GET') {
      const bookings = await store.listBookings();
      return res.status(200).json({ bookings, storage: store.storageMode() });
    }

    if (req.method === 'PATCH') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Missing booking id' });
      const booking = await store.updateBooking(id, req.body || {});
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      return res.status(200).json({ booking });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Missing booking id' });
      const removed = await store.deleteBooking(id);
      if (!removed) return res.status(404).json({ error: 'Booking not found' });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('bookings error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please call or text 702.720.0758.' });
  }
};
