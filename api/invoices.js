const store = require('../lib/store');
const auth = require('../lib/auth');

module.exports = async (req, res) => {
  try {
    if (!auth.requireAuth(req, res)) return undefined;

    if (req.method === 'GET') {
      const invoices = await store.listInvoices();
      return res.status(200).json({ invoices, storage: store.storageMode() });
    }

    if (req.method === 'POST') {
      const invoice = await store.createInvoice(req.body || {});
      return res.status(201).json({ invoice });
    }

    if (req.method === 'PATCH') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Missing invoice id' });
      const invoice = await store.updateInvoice(id, req.body || {});
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      return res.status(200).json({ invoice });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Missing invoice id' });
      const removed = await store.deleteInvoice(id);
      if (!removed) return res.status(404).json({ error: 'Invoice not found' });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('invoices error:', err);
    return res.status(500).json({ error: 'Something went wrong loading invoices.' });
  }
};
