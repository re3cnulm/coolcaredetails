const store = require('../lib/store');
const auth = require('../lib/auth');

// Public diagnostic endpoint. Reports only booleans — never secrets — so it is
// safe to leave live. Visit /api/health to confirm the deployment is wired up.
module.exports = async (req, res) => {
  const report = {
    ok: true,
    service: 'Coolcare Details',
    time: new Date().toISOString(),
    functionsRunning: true,
    crmPasswordSet: auth.isConfigured(),
    storage: store.storageMode(),
    databaseConnected: false
  };

  if (store.storageMode() === 'postgres') {
    try {
      await store.listBookings();
      report.databaseConnected = true;
    } catch (err) {
      report.ok = false;
      report.databaseError = err.message;
    }
  }

  report.nextSteps = [
    report.crmPasswordSet ? null : 'Set a CRM_PASSWORD environment variable in Vercel, then redeploy.',
    report.storage === 'postgres' ? null : 'Attach a Postgres database in Vercel → Storage so bookings persist.'
  ].filter(Boolean);

  return res.status(report.ok ? 200 : 500).json(report);
};
