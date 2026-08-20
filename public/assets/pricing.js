/* Shared service catalogue + quote math. Loaded in the browser as window.CCD,
   and required by the API functions through lib/pricing.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CCD = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var VEHICLES = [
    { id: 'small', label: 'Small Car (Sedan / Coupe)' },
    { id: 'midsize', label: 'Midsize SUV / Pickup' },
    { id: 'large', label: 'Large SUV / Full-Size Pickup' }
  ];

  var PACKAGES = [
    { id: 'basic', label: 'Basic Detail', prices: { small: 85, midsize: 110, large: 125 } },
    { id: 'intermediate', label: 'Intermediate Detail', prices: { small: 140, midsize: 175, large: 210 } },
    { id: 'full', label: 'Full Detail', prices: { small: 250, midsize: 280, large: 320 } }
  ];

  var ADDONS = [
    { id: 'engine_bay', label: 'Engine Bay Detail', price: 45 },
    { id: 'spray_wax', label: 'Spray Wax Protection', price: 30 },
    { id: 'headlight', label: 'Headlight Restoration', price: 100 },
    { id: 'trim', label: 'Exterior Plastic Trim Conditioning', price: 25 },
    { id: 'leather', label: 'Leather Conditioning', price: 20 },
    { id: 'carpet_shampoo', label: 'Carpet Shampoo', price: 100 },
    { id: 'seat_shampoo', label: 'Seat Shampoo', price: 100 },
    { id: 'wheel_well', label: 'Wheel Well Conditioning', price: 15 }
  ];

  var STATUSES = [
    { id: 'new', label: 'New Lead' },
    { id: 'contacted', label: 'Contacted' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' }
  ];

  var INVOICE_STATUSES = [
    { id: 'draft', label: 'Draft' },
    { id: 'sent', label: 'Sent' },
    { id: 'paid', label: 'Paid' },
    { id: 'void', label: 'Void' }
  ];

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function vehicleLabel(id) { var v = byId(VEHICLES, id); return v ? v.label : (id || ''); }
  function packageLabel(id) { var p = byId(PACKAGES, id); return p ? p.label : (id || ''); }
  function addonLabel(id) { var a = byId(ADDONS, id); return a ? a.label : id; }
  function statusLabel(id) { var s = byId(STATUSES, id); return s ? s.label : (id || ''); }

  /* Builds the itemised quote for a vehicle + package + add-on selection.
     Returns { lines: [{description, qty, unitPrice, total}], total }. */
  function quote(vehicleId, packageId, addonIds) {
    var lines = [];
    var pkg = byId(PACKAGES, packageId);
    if (pkg && pkg.prices[vehicleId] != null) {
      lines.push({
        description: pkg.label + ' — ' + vehicleLabel(vehicleId),
        qty: 1,
        unitPrice: pkg.prices[vehicleId],
        total: pkg.prices[vehicleId]
      });
    }
    (addonIds || []).forEach(function (id) {
      var a = byId(ADDONS, id);
      if (a) lines.push({ description: a.label, qty: 1, unitPrice: a.price, total: a.price });
    });
    var total = lines.reduce(function (sum, l) { return sum + l.total; }, 0);
    return { lines: lines, total: total };
  }

  function money(n) {
    var v = Number(n || 0);
    return '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* Totals for an invoice: items + tax + discount. */
  function invoiceTotals(items, taxRate, discount) {
    var subtotal = (items || []).reduce(function (sum, i) {
      return sum + Number(i.qty || 0) * Number(i.unitPrice || 0);
    }, 0);
    var disc = Number(discount || 0);
    var taxable = Math.max(0, subtotal - disc);
    var tax = taxable * (Number(taxRate || 0) / 100);
    return {
      subtotal: subtotal,
      discount: disc,
      tax: tax,
      total: taxable + tax
    };
  }

  return {
    VEHICLES: VEHICLES,
    PACKAGES: PACKAGES,
    ADDONS: ADDONS,
    STATUSES: STATUSES,
    INVOICE_STATUSES: INVOICE_STATUSES,
    BUSINESS: {
      name: 'Coolcare Details',
      tagline: 'Premium Car Care. Exceptional Results.',
      phone: '702.720.0758',
      phoneRaw: '7027200758',
      area: 'Mobile Service — All Around Las Vegas',
      instagram: 'coolcare_details'
    },
    vehicleLabel: vehicleLabel,
    packageLabel: packageLabel,
    addonLabel: addonLabel,
    statusLabel: statusLabel,
    quote: quote,
    money: money,
    invoiceTotals: invoiceTotals
  };
});
