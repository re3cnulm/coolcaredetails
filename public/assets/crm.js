(function () {
  'use strict';

  var state = {
    bookings: [],
    invoices: [],
    storage: 'memory',
    view: 'pipeline',
    search: '',
    statusFilter: '',
    invoiceFilter: '',
    calMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selectedDay: null
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ============================================================= helpers == */

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function api(path, options) {
    return fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options))
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          if (response.status === 401) { showLogin(); throw new Error('Session expired — sign in again.'); }
          if (!response.ok) throw new Error(body.error || 'Request failed');
          return body;
        });
      });
  }

  function fmtDate(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d)) return String(value);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtDateTime(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d)) return String(value);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function fmtTime(value) {
    var d = new Date(value);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  // <input type="datetime-local"> needs a local-time string, not a UTC ISO one.
  function toLocalInput(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d)) return '';
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function dayKey(value) {
    var d = new Date(value);
    if (isNaN(d)) return '';
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function statusPill(status) {
    return '<span class="pill pill-' + esc(status) + '">' + esc(CCD.statusLabel(status)) + '</span>';
  }

  function invoicePill(status) {
    var found = CCD.INVOICE_STATUSES.filter(function (s) { return s.id === status; })[0];
    return '<span class="pill pill-' + esc(status) + '">' + esc(found ? found.label : status) + '</span>';
  }

  function bookingTotal(booking) {
    if (booking.quote != null) return Number(booking.quote);
    return CCD.quote(booking.vehicle, booking.package, booking.addons).total;
  }

  function invoiceTotal(invoice) {
    return CCD.invoiceTotals(invoice.items, invoice.taxRate, invoice.discount).total;
  }

  /* =============================================================== auth === */

  function showLogin() {
    $('login-screen').hidden = false;
    $('app').hidden = true;
  }

  function showApp() {
    $('login-screen').hidden = true;
    $('app').hidden = false;
  }

  $('login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var button = $('login-submit');
    var message = $('login-message');
    button.disabled = true;
    button.textContent = 'Signing in…';
    message.textContent = '';

    api('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ action: 'login', password: $('login-password').value })
    }).then(function () {
      $('login-password').value = '';
      showApp();
      return loadData();
    }).catch(function (err) {
      message.textContent = err.message;
      message.className = 'form-message is-error';
    }).finally(function () {
      button.disabled = false;
      button.textContent = 'Sign In';
    });
  });

  $('logout').addEventListener('click', function () {
    api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) })
      .catch(function () {})
      .finally(showLogin);
  });

  /* =============================================================== data === */

  function loadData() {
    return Promise.all([api('/api/bookings'), api('/api/invoices')])
      .then(function (results) {
        state.bookings = results[0].bookings || [];
        state.invoices = results[1].invoices || [];
        state.storage = results[0].storage || 'memory';
        $('storage-warning').hidden = state.storage === 'postgres';
        renderAll();
      })
      .catch(function (err) { console.error(err); });
  }

  function renderAll() {
    renderStats();
    renderLeads();
    renderCalendar();
    renderInvoices();
  }

  /* ============================================================== views === */

  document.querySelectorAll('.crm-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      state.view = tab.dataset.view;
      document.querySelectorAll('.crm-tab').forEach(function (t) { t.classList.toggle('is-on', t === tab); });
      ['pipeline', 'schedule', 'invoices'].forEach(function (view) {
        $('view-' + view).hidden = view !== state.view;
      });
    });
  });

  /* ============================================================== stats === */

  function renderStats() {
    var open = state.bookings.filter(function (b) {
      return ['new', 'contacted', 'scheduled', 'in_progress'].indexOf(b.status) >= 0;
    });
    var newLeads = state.bookings.filter(function (b) { return b.status === 'new'; });
    var todayKey = dayKey(new Date());
    var today = state.bookings.filter(function (b) { return b.scheduledAt && dayKey(b.scheduledAt) === todayKey; });
    var completed = state.bookings.filter(function (b) { return b.status === 'completed'; });
    var pipeline = open.reduce(function (sum, b) { return sum + bookingTotal(b); }, 0);

    $('stat-row').innerHTML = [
      stat(newLeads.length, 'New leads', 'accent-red'),
      stat(today.length, 'Jobs today', 'accent-blue'),
      stat(open.length, 'Open jobs', 'accent-yellow'),
      stat(completed.length, 'Completed', 'accent-green'),
      stat(CCD.money(pipeline), 'Pipeline value', '')
    ].join('');

    var unpaid = state.invoices.filter(function (i) { return i.status === 'sent'; });
    var paid = state.invoices.filter(function (i) { return i.status === 'paid'; });
    var outstanding = unpaid.reduce(function (sum, i) { return sum + invoiceTotal(i); }, 0);
    var collected = paid.reduce(function (sum, i) { return sum + invoiceTotal(i); }, 0);

    $('invoice-stats').innerHTML = [
      stat(state.invoices.length, 'Invoices', ''),
      stat(unpaid.length, 'Awaiting payment', 'accent-yellow'),
      stat(CCD.money(outstanding), 'Outstanding', 'accent-yellow'),
      stat(CCD.money(collected), 'Collected', 'accent-green')
    ].join('');
  }

  function stat(value, label, accent) {
    return '<div class="stat ' + accent + '">' +
      '<div class="stat-value">' + esc(value) + '</div>' +
      '<div class="stat-label">' + esc(label) + '</div></div>';
  }

  /* ============================================================== leads === */

  CCD.STATUSES.forEach(function (s) {
    var option = document.createElement('option');
    option.value = s.id;
    option.textContent = s.label;
    $('status-filter').appendChild(option);
  });

  CCD.INVOICE_STATUSES.forEach(function (s) {
    var option = document.createElement('option');
    option.value = s.id;
    option.textContent = s.label;
    $('invoice-filter').appendChild(option);
  });

  $('search').addEventListener('input', function (e) { state.search = e.target.value.toLowerCase(); renderLeads(); });
  $('status-filter').addEventListener('change', function (e) { state.statusFilter = e.target.value; renderLeads(); });
  $('invoice-filter').addEventListener('change', function (e) { state.invoiceFilter = e.target.value; renderInvoices(); });
  $('refresh').addEventListener('click', loadData);
  $('new-lead').addEventListener('click', function () { openLeadDrawer(null); });
  $('new-invoice').addEventListener('click', function () { openInvoiceDrawer(null); });

  function visibleLeads() {
    return state.bookings.filter(function (b) {
      if (state.statusFilter && b.status !== state.statusFilter) return false;
      if (!state.search) return true;
      var haystack = [b.name, b.phone, b.email, b.address, b.vehicleDesc].join(' ').toLowerCase();
      return haystack.indexOf(state.search) >= 0;
    });
  }

  function renderLeads() {
    var rows = visibleLeads();
    var tbody = $('leads-table').querySelector('tbody');
    tbody.innerHTML = rows.map(function (b) {
      return '<tr data-id="' + esc(b.id) + '">' +
        '<td>' + esc(fmtDate(b.createdAt)) + '</td>' +
        '<td><div class="cell-name">' + esc(b.name) + '</div>' +
            '<div class="cell-sub">' + esc(b.phone) + '</div></td>' +
        '<td><div>' + esc(CCD.packageLabel(b.package)) + '</div>' +
            '<div class="cell-sub">' + esc(CCD.vehicleLabel(b.vehicle)) +
            (b.addons && b.addons.length ? ' · +' + b.addons.length + ' add-on' + (b.addons.length > 1 ? 's' : '') : '') +
            '</div></td>' +
        '<td>' + esc(fmtDateTime(b.scheduledAt)) + '</td>' +
        '<td class="cell-money">' + esc(CCD.money(bookingTotal(b))) + '</td>' +
        '<td>' + statusPill(b.status) + '</td>' +
        '<td class="cell-sub">Open ›</td>' +
        '</tr>';
    }).join('');

    $('leads-empty').hidden = rows.length > 0;
    tbody.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openLeadDrawer(tr.dataset.id); });
    });
  }

  /* =========================================================== calendar === */

  $('cal-prev').addEventListener('click', function () { shiftMonth(-1); });
  $('cal-next').addEventListener('click', function () { shiftMonth(1); });
  $('cal-today').addEventListener('click', function () {
    var now = new Date();
    state.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    state.selectedDay = dayKey(now);
    renderCalendar();
  });

  function shiftMonth(delta) {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + delta, 1);
    renderCalendar();
  }

  function scheduledByDay() {
    var map = {};
    state.bookings.forEach(function (b) {
      if (!b.scheduledAt || b.status === 'cancelled') return;
      var key = dayKey(b.scheduledAt);
      (map[key] = map[key] || []).push(b);
    });
    Object.keys(map).forEach(function (key) {
      map[key].sort(function (a, b) { return new Date(a.scheduledAt) - new Date(b.scheduledAt); });
    });
    return map;
  }

  function renderCalendar() {
    var year = state.calMonth.getFullYear();
    var month = state.calMonth.getMonth();
    $('cal-title').textContent = state.calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    var jobs = scheduledByDay();
    var firstDay = new Date(year, month, 1);
    var start = new Date(firstDay);
    start.setDate(1 - firstDay.getDay()); // back up to Sunday

    var html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      .map(function (d) { return '<div class="cal-head">' + d + '</div>'; }).join('');

    var todayKey = dayKey(new Date());

    for (var i = 0; i < 42; i++) {
      var date = new Date(start);
      date.setDate(start.getDate() + i);
      var key = dayKey(date);
      var dayJobs = jobs[key] || [];
      var classes = ['cal-day'];
      if (date.getMonth() !== month) classes.push('is-outside');
      if (key === todayKey) classes.push('is-today');
      if (key === state.selectedDay) classes.push('is-selected');

      var chips = dayJobs.slice(0, 3).map(function (b) {
        return '<div class="cal-job status-' + esc(b.status) + '">' +
          esc(fmtTime(b.scheduledAt)) + ' ' + esc(b.name) + '</div>';
      }).join('');
      if (dayJobs.length > 3) chips += '<div class="cal-more">+' + (dayJobs.length - 3) + ' more</div>';

      html += '<div class="' + classes.join(' ') + '" data-day="' + key + '">' +
        '<div class="cal-date">' + date.getDate() + '</div>' + chips + '</div>';
    }

    $('calendar').innerHTML = html;
    $('calendar').querySelectorAll('.cal-day').forEach(function (cell) {
      cell.addEventListener('click', function () {
        state.selectedDay = cell.dataset.day;
        renderCalendar();
      });
    });

    renderDayPanel(jobs);
  }

  function renderDayPanel(jobs) {
    var panel = $('day-panel');
    if (!state.selectedDay) { panel.innerHTML = ''; return; }

    var dayJobs = jobs[state.selectedDay] || [];
    var heading = new Date(state.selectedDay + 'T12:00:00')
      .toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    if (!dayJobs.length) {
      panel.innerHTML = '<h3>' + esc(heading) + '</h3>' +
        '<p class="empty-state">Nothing scheduled. Open a lead and set an appointment time to fill this day.</p>';
      return;
    }

    panel.innerHTML = '<h3>' + esc(heading) + ' — ' + dayJobs.length + ' job' + (dayJobs.length > 1 ? 's' : '') + '</h3>' +
      dayJobs.map(function (b) {
        return '<div class="day-job" data-id="' + esc(b.id) + '">' +
          '<span class="day-time">' + esc(fmtTime(b.scheduledAt)) + '</span>' +
          '<div><div class="cell-name">' + esc(b.name) + '</div>' +
          '<div class="cell-sub">' + esc(b.phone) + (b.address ? ' · ' + esc(b.address) : '') + '</div></div>' +
          '<div class="cell-sub">' + esc(CCD.packageLabel(b.package)) + ' · ' +
            esc(CCD.vehicleLabel(b.vehicle)) + '</div>' +
          '<span class="cell-money">' + esc(CCD.money(bookingTotal(b))) + '</span>' +
          statusPill(b.status) + '</div>';
      }).join('');

    panel.querySelectorAll('.day-job').forEach(function (el) {
      el.addEventListener('click', function () { openLeadDrawer(el.dataset.id); });
    });
  }

  /* =========================================================== invoices === */

  function renderInvoices() {
    var rows = state.invoices.filter(function (i) {
      return !state.invoiceFilter || i.status === state.invoiceFilter;
    });
    var tbody = $('invoices-table').querySelector('tbody');
    tbody.innerHTML = rows.map(function (i) {
      return '<tr data-id="' + esc(i.id) + '">' +
        '<td class="cell-name">#' + esc(i.number) + '</td>' +
        '<td>' + esc(i.customerName || '—') + '<div class="cell-sub">' + esc(i.customerPhone || '') + '</div></td>' +
        '<td>' + esc(fmtDate(i.issueDate)) + '</td>' +
        '<td>' + esc(i.dueDate ? fmtDate(i.dueDate) : '—') + '</td>' +
        '<td class="cell-money">' + esc(CCD.money(invoiceTotal(i))) + '</td>' +
        '<td>' + invoicePill(i.status) + '</td>' +
        '<td class="cell-sub">Open ›</td>' +
        '</tr>';
    }).join('');

    $('invoices-empty').hidden = rows.length > 0;
    tbody.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openInvoiceDrawer(tr.dataset.id); });
    });
  }

  /* ============================================================= drawer === */

  function openDrawer(html) {
    $('drawer-body').innerHTML = html;
    $('drawer').hidden = false;
    $('drawer-backdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    $('drawer').hidden = true;
    $('drawer-backdrop').hidden = true;
    document.body.style.overflow = '';
  }

  $('drawer-close').addEventListener('click', closeDrawer);
  $('drawer-backdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('drawer').hidden) closeDrawer();
  });

  /* --------------------------------------------------------- lead drawer -- */

  function openLeadDrawer(id) {
    var booking = id ? state.bookings.filter(function (b) { return b.id === id; })[0] : null;
    var isNew = !booking;
    if (isNew) {
      booking = { name: '', phone: '', email: '', address: '', vehicle: 'small',
        package: 'basic', addons: [], status: 'new', notes: '', crmNotes: '', source: 'phone' };
    }

    var quote = CCD.quote(booking.vehicle, booking.package, booking.addons);

    var html = '<h2>' + (isNew ? 'New Lead' : esc(booking.name)) + '</h2>' +
      '<p class="drawer-sub">' + (isNew ? 'Log a call-in or walk-up job' :
        'Received ' + esc(fmtDateTime(booking.createdAt)) + ' · ' + esc(booking.source || 'website')) + '</p>';

    html += '<div class="drawer-section"><h3>Customer</h3>' +
      '<div class="field-row">' +
        field('Name', 'lead-name', 'text', booking.name) +
        field('Phone', 'lead-phone', 'tel', booking.phone) +
      '</div>' +
      '<div class="field-row">' +
        field('Email', 'lead-email', 'email', booking.email) +
        field('Address', 'lead-address', 'text', booking.address) +
      '</div>' +
      field('Vehicle', 'lead-vehicledesc', 'text', booking.vehicleDesc) +
      '</div>';

    html += '<div class="drawer-section"><h3>Service</h3>' +
      '<div class="field-row">' +
        select('Vehicle size', 'lead-vehicle', CCD.VEHICLES, booking.vehicle) +
        select('Package', 'lead-package', CCD.PACKAGES, booking.package) +
      '</div>' +
      '<label class="field"><span>Add-ons</span><div class="addon-check-list">' +
      CCD.ADDONS.map(function (a) {
        var on = (booking.addons || []).indexOf(a.id) >= 0;
        return '<label class="addon-check"><input type="checkbox" value="' + a.id + '"' +
          (on ? ' checked' : '') + '> ' + esc(a.label) + ' <b>' + CCD.money(a.price) + '</b></label>';
      }).join('') +
      '</div></label>' +
      '<div class="field-row">' +
        field('Quote ($)', 'lead-quote', 'number', booking.quote != null ? booking.quote : quote.total) +
        select('Status', 'lead-status', CCD.STATUSES, booking.status) +
      '</div>' +
      '</div>';

    html += '<div class="drawer-section"><h3>Schedule</h3>' +
      '<div class="field-row">' +
        '<label class="field"><span>Appointment</span>' +
        '<input type="datetime-local" id="lead-scheduled" value="' + esc(toLocalInput(booking.scheduledAt)) + '"></label>' +
        field('Duration (min)', 'lead-duration', 'number', booking.durationMin || 120) +
      '</div>' +
      (booking.preferredDate || booking.preferredTime
        ? '<p class="cell-sub">Customer asked for: <b>' + esc(booking.preferredDate ? fmtDate(booking.preferredDate) : 'any day') +
          '</b> ' + esc(booking.preferredTime || '') + '</p>'
        : '') +
      '</div>';

    html += '<div class="drawer-section"><h3>Notes</h3>' +
      (booking.notes ? '<p class="cell-sub"><b>From customer:</b> ' + esc(booking.notes) + '</p>' : '') +
      '<label class="field"><span>Internal notes</span><textarea id="lead-crmnotes" rows="3">' +
      esc(booking.crmNotes || '') + '</textarea></label>' +
      '</div>';

    html += '<p class="form-message" id="lead-message"></p>' +
      '<div class="drawer-actions">' +
      '<button class="btn btn-red" id="lead-save">' + (isNew ? 'Create Lead' : 'Save Changes') + '</button>' +
      (isNew ? '' : '<button class="ghost-btn" id="lead-invoice">Create Invoice</button>') +
      (isNew ? '' : '<a class="ghost-btn" href="tel:' + esc(booking.phone) + '">Call</a>') +
      (isNew ? '' : '<button class="ghost-btn danger-btn" id="lead-delete">Delete</button>') +
      '</div>';

    openDrawer(html);

    function collect() {
      var addons = [];
      $('drawer-body').querySelectorAll('.addon-check input:checked')
        .forEach(function (input) { addons.push(input.value); });
      return {
        name: $('lead-name').value.trim(),
        phone: $('lead-phone').value.trim(),
        email: $('lead-email').value.trim(),
        address: $('lead-address').value.trim(),
        vehicleDesc: $('lead-vehicledesc').value.trim(),
        vehicle: $('lead-vehicle').value,
        package: $('lead-package').value,
        addons: addons,
        quote: $('lead-quote').value === '' ? null : Number($('lead-quote').value),
        status: $('lead-status').value,
        scheduledAt: $('lead-scheduled').value ? new Date($('lead-scheduled').value).toISOString() : null,
        durationMin: Number($('lead-duration').value) || 120,
        crmNotes: $('lead-crmnotes').value.trim()
      };
    }

    // Re-price when the service selection changes, unless the quote was hand-edited.
    var quoteEdited = false;
    $('lead-quote').addEventListener('input', function () { quoteEdited = true; });
    ['lead-vehicle', 'lead-package'].forEach(function (fieldId) {
      $(fieldId).addEventListener('change', repriceUnlessEdited);
    });
    $('drawer-body').querySelectorAll('.addon-check input').forEach(function (input) {
      input.addEventListener('change', repriceUnlessEdited);
    });

    function repriceUnlessEdited() {
      if (quoteEdited) return;
      var data = collect();
      $('lead-quote').value = CCD.quote(data.vehicle, data.package, data.addons).total;
    }

    $('lead-save').addEventListener('click', function () {
      var data = collect();
      var message = $('lead-message');
      if (data.name.length < 2 || data.phone.replace(/\D/g, '').length < 10) {
        message.textContent = 'A name and a valid phone number are required.';
        message.className = 'form-message is-error';
        return;
      }
      this.disabled = true;
      var request = isNew
        ? api('/api/bookings', { method: 'POST', body: JSON.stringify(Object.assign({ source: 'phone' }, data)) })
            .then(function () { return api('/api/bookings'); })
        : api('/api/bookings?id=' + encodeURIComponent(booking.id), {
            method: 'PATCH', body: JSON.stringify(data)
          });

      request.then(function () { return loadData(); })
        .then(closeDrawer)
        .catch(function (err) {
          message.textContent = err.message;
          message.className = 'form-message is-error';
          $('lead-save').disabled = false;
        });
    });

    if (!isNew) {
      $('lead-delete').addEventListener('click', function () {
        if (!confirm('Delete this booking permanently?')) return;
        api('/api/bookings?id=' + encodeURIComponent(booking.id), { method: 'DELETE' })
          .then(loadData).then(closeDrawer)
          .catch(function (err) { alert(err.message); });
      });

      $('lead-invoice').addEventListener('click', function () {
        var data = collect();
        var lines = CCD.quote(data.vehicle, data.package, data.addons).lines;
        openInvoiceDrawer(null, {
          bookingId: booking.id,
          customerName: data.name,
          customerPhone: data.phone,
          customerEmail: data.email,
          customerAddress: data.address,
          items: lines.map(function (l) {
            return { description: l.description, qty: l.qty, unitPrice: l.unitPrice };
          })
        });
      });
    }
  }

  function field(label, id, type, value) {
    return '<label class="field"><span>' + esc(label) + '</span>' +
      '<input type="' + type + '" id="' + id + '" value="' + esc(value == null ? '' : value) + '"></label>';
  }

  function select(label, id, options, value) {
    return '<label class="field"><span>' + esc(label) + '</span><select id="' + id + '">' +
      options.map(function (o) {
        return '<option value="' + esc(o.id) + '"' + (o.id === value ? ' selected' : '') + '>' +
          esc(o.label) + '</option>';
      }).join('') + '</select></label>';
  }

  /* ------------------------------------------------------ invoice drawer -- */

  function openInvoiceDrawer(id, seed) {
    var invoice = id ? state.invoices.filter(function (i) { return i.id === id; })[0] : null;
    var isNew = !invoice;
    if (isNew) {
      invoice = Object.assign({
        number: 'new', customerName: '', customerPhone: '', customerEmail: '', customerAddress: '',
        items: [{ description: '', qty: 1, unitPrice: 0 }], taxRate: 0, discount: 0,
        status: 'draft', issueDate: new Date().toISOString().slice(0, 10), dueDate: '', notes: ''
      }, seed || {});
    }

    var items = (invoice.items || []).slice();
    if (!items.length) items.push({ description: '', qty: 1, unitPrice: 0 });

    var html = '<h2>Invoice #' + esc(invoice.number) + '</h2>' +
      '<p class="drawer-sub">' + (isNew ? 'New invoice' : 'Created ' + esc(fmtDate(invoice.createdAt))) + '</p>';

    html += '<div class="drawer-section no-print"><h3>Bill To</h3>' +
      '<div class="field-row">' +
        field('Name', 'inv-name', 'text', invoice.customerName) +
        field('Phone', 'inv-phone', 'tel', invoice.customerPhone) +
      '</div>' +
      '<div class="field-row">' +
        field('Email', 'inv-email', 'email', invoice.customerEmail) +
        field('Address', 'inv-address', 'text', invoice.customerAddress) +
      '</div></div>';

    html += '<div class="drawer-section no-print"><h3>Line Items</h3>' +
      '<table class="line-items"><thead><tr>' +
      '<th>Description</th><th class="col-qty">Qty</th><th class="col-price">Price</th><th class="col-del"></th>' +
      '</tr></thead><tbody id="inv-items"></tbody></table>' +
      '<button class="ghost-btn" id="inv-add-row">+ Add line</button>' +
      '<div class="field-row" style="margin-top:1rem">' +
        field('Tax rate (%)', 'inv-tax', 'number', invoice.taxRate) +
        field('Discount ($)', 'inv-discount', 'number', invoice.discount) +
      '</div>' +
      '<ul class="totals" id="inv-totals"></ul></div>';

    html += '<div class="drawer-section no-print"><h3>Terms</h3>' +
      '<div class="field-row">' +
        select('Status', 'inv-status', CCD.INVOICE_STATUSES, invoice.status) +
        field('Issued', 'inv-issue', 'date', invoice.issueDate ? String(invoice.issueDate).slice(0, 10) : '') +
      '</div>' +
      '<div class="field-row">' +
        field('Due', 'inv-due', 'date', invoice.dueDate ? String(invoice.dueDate).slice(0, 10) : '') +
        field('Paid on', 'inv-paid', 'date', invoice.paidDate ? String(invoice.paidDate).slice(0, 10) : '') +
      '</div>' +
      '<label class="field"><span>Notes on invoice</span><textarea id="inv-notes" rows="2">' +
      esc(invoice.notes || '') + '</textarea></label></div>';

    html += '<p class="form-message no-print" id="inv-message"></p>' +
      '<div class="drawer-actions no-print">' +
      '<button class="btn btn-red" id="inv-save">' + (isNew ? 'Create Invoice' : 'Save Changes') + '</button>' +
      '<button class="ghost-btn" id="inv-print">Print / PDF</button>' +
      (isNew ? '' : '<button class="ghost-btn danger-btn" id="inv-delete">Delete</button>') +
      '</div>' +
      '<div class="print-only" id="inv-print-view"></div>';

    openDrawer(html);

    function renderItems() {
      $('inv-items').innerHTML = items.map(function (item, index) {
        return '<tr>' +
          '<td><input type="text" data-row="' + index + '" data-key="description" value="' + esc(item.description) + '"></td>' +
          '<td><input type="number" step="0.5" data-row="' + index + '" data-key="qty" value="' + esc(item.qty) + '"></td>' +
          '<td><input type="number" step="0.01" data-row="' + index + '" data-key="unitPrice" value="' + esc(item.unitPrice) + '"></td>' +
          '<td><button class="row-del" data-del="' + index + '" title="Remove">×</button></td>' +
          '</tr>';
      }).join('');

      $('inv-items').querySelectorAll('input').forEach(function (input) {
        input.addEventListener('input', function () {
          var row = items[Number(input.dataset.row)];
          var key = input.dataset.key;
          row[key] = key === 'description' ? input.value : Number(input.value || 0);
          renderTotals();
        });
      });
      $('inv-items').querySelectorAll('[data-del]').forEach(function (button) {
        button.addEventListener('click', function () {
          items.splice(Number(button.dataset.del), 1);
          if (!items.length) items.push({ description: '', qty: 1, unitPrice: 0 });
          renderItems();
          renderTotals();
        });
      });
    }

    function renderTotals() {
      var totals = CCD.invoiceTotals(items, $('inv-tax').value, $('inv-discount').value);
      $('inv-totals').innerHTML =
        '<li><span>Subtotal</span><b>' + CCD.money(totals.subtotal) + '</b></li>' +
        (totals.discount ? '<li><span>Discount</span><b>−' + CCD.money(totals.discount) + '</b></li>' : '') +
        (totals.tax ? '<li><span>Tax</span><b>' + CCD.money(totals.tax) + '</b></li>' : '') +
        '<li class="grand"><span>Total</span><b>' + CCD.money(totals.total) + '</b></li>';
    }

    renderItems();
    renderTotals();
    $('inv-tax').addEventListener('input', renderTotals);
    $('inv-discount').addEventListener('input', renderTotals);
    $('inv-add-row').addEventListener('click', function () {
      items.push({ description: '', qty: 1, unitPrice: 0 });
      renderItems();
      renderTotals();
    });

    function collect() {
      return {
        bookingId: invoice.bookingId || null,
        customerName: $('inv-name').value.trim(),
        customerPhone: $('inv-phone').value.trim(),
        customerEmail: $('inv-email').value.trim(),
        customerAddress: $('inv-address').value.trim(),
        items: items.filter(function (i) { return i.description || i.unitPrice; }),
        taxRate: Number($('inv-tax').value || 0),
        discount: Number($('inv-discount').value || 0),
        status: $('inv-status').value,
        issueDate: $('inv-issue').value || null,
        dueDate: $('inv-due').value || null,
        paidDate: $('inv-paid').value || null,
        notes: $('inv-notes').value.trim()
      };
    }

    $('inv-save').addEventListener('click', function () {
      var data = collect();
      var message = $('inv-message');
      if (!data.customerName) {
        message.textContent = 'Add a customer name first.';
        message.className = 'form-message is-error';
        return;
      }
      this.disabled = true;
      var request = isNew
        ? api('/api/invoices', { method: 'POST', body: JSON.stringify(data) })
        : api('/api/invoices?id=' + encodeURIComponent(invoice.id), { method: 'PATCH', body: JSON.stringify(data) });

      request.then(loadData).then(closeDrawer).catch(function (err) {
        message.textContent = err.message;
        message.className = 'form-message is-error';
        $('inv-save').disabled = false;
      });
    });

    $('inv-print').addEventListener('click', function () {
      $('inv-print-view').innerHTML = printableInvoice(Object.assign({}, invoice, collect()));
      window.print();
    });

    if (!isNew) {
      $('inv-delete').addEventListener('click', function () {
        if (!confirm('Delete invoice #' + invoice.number + '?')) return;
        api('/api/invoices?id=' + encodeURIComponent(invoice.id), { method: 'DELETE' })
          .then(loadData).then(closeDrawer)
          .catch(function (err) { alert(err.message); });
      });
    }
  }

  function printableInvoice(invoice) {
    var totals = CCD.invoiceTotals(invoice.items, invoice.taxRate, invoice.discount);
    var business = CCD.BUSINESS;

    return '<div class="invoice-print">' +
      '<div class="inv-head"><div>' +
        '<h1>' + esc(business.name) + '</h1>' +
        '<div>' + esc(business.area) + '</div>' +
        '<div>' + esc(business.phone) + '</div>' +
      '</div><div style="text-align:right">' +
        '<h1>INVOICE</h1>' +
        '<div>#' + esc(invoice.number) + '</div>' +
        '<div>Issued ' + esc(invoice.issueDate ? fmtDate(invoice.issueDate) : '—') + '</div>' +
        (invoice.dueDate ? '<div>Due ' + esc(fmtDate(invoice.dueDate)) + '</div>' : '') +
      '</div></div>' +
      '<div><strong>Bill to:</strong><br>' + esc(invoice.customerName) +
        (invoice.customerPhone ? '<br>' + esc(invoice.customerPhone) : '') +
        (invoice.customerEmail ? '<br>' + esc(invoice.customerEmail) : '') +
        (invoice.customerAddress ? '<br>' + esc(invoice.customerAddress) : '') +
      '</div>' +
      '<table><thead><tr><th>Description</th><th class="num">Qty</th>' +
      '<th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>' +
      (invoice.items || []).map(function (i) {
        return '<tr><td>' + esc(i.description) + '</td>' +
          '<td class="num">' + esc(i.qty) + '</td>' +
          '<td class="num">' + CCD.money(i.unitPrice) + '</td>' +
          '<td class="num">' + CCD.money(Number(i.qty) * Number(i.unitPrice)) + '</td></tr>';
      }).join('') +
      '<tr><td colspan="3" class="num">Subtotal</td><td class="num">' + CCD.money(totals.subtotal) + '</td></tr>' +
      (totals.discount ? '<tr><td colspan="3" class="num">Discount</td><td class="num">−' + CCD.money(totals.discount) + '</td></tr>' : '') +
      (totals.tax ? '<tr><td colspan="3" class="num">Tax</td><td class="num">' + CCD.money(totals.tax) + '</td></tr>' : '') +
      '<tr class="grand"><td colspan="3" class="num">Total</td><td class="num">' + CCD.money(totals.total) + '</td></tr>' +
      '</tbody></table>' +
      (invoice.notes ? '<p style="margin-top:14px">' + esc(invoice.notes) + '</p>' : '') +
      '<p style="margin-top:20px;font-size:12px">Thank you for your business — ' +
      esc(business.tagline) + '</p></div>';
  }

  /* =============================================================== boot === */

  api('/api/auth').then(function (result) {
    if (result.authenticated) { showApp(); return loadData(); }
    showLogin();
    if (!result.configured) {
      var message = $('login-message');
      message.textContent = 'CRM not configured yet — set a CRM_PASSWORD environment variable in Vercel, then redeploy.';
      message.className = 'form-message is-error';
    }
  }).catch(showLogin);
})();
