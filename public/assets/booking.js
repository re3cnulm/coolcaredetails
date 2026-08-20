(function () {
  var form = document.getElementById('booking-form');
  if (!form || !window.CCD) return;

  var state = { vehicle: '', package: '', addons: [] };

  var vehicleBox = document.getElementById('vehicle-choices');
  var packageBox = document.getElementById('package-choices');
  var addonBox = document.getElementById('addon-choices');
  var linesBox = document.getElementById('quote-lines');
  var totalBox = document.getElementById('quote-total');
  var message = document.getElementById('form-message');
  var submit = document.getElementById('booking-submit');

  var dateInput = document.getElementById('preferred-date');
  if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);

  /* ------------------------------------------------------------- render -- */

  CCD.VEHICLES.forEach(function (vehicle) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.dataset.id = vehicle.id;
    button.innerHTML = '<span class="choice-label">' + vehicle.label + '</span>';
    button.addEventListener('click', function () {
      state.vehicle = vehicle.id;
      syncChoices();
      renderQuote();
    });
    vehicleBox.appendChild(button);
  });

  CCD.PACKAGES.forEach(function (pkg) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice choice-package tier-' + pkg.id;
    button.dataset.id = pkg.id;
    button.innerHTML =
      '<span class="choice-label">' + pkg.label + '</span>' +
      '<span class="choice-price" data-price></span>';
    button.addEventListener('click', function () {
      state.package = pkg.id;
      syncChoices();
      renderQuote();
    });
    packageBox.appendChild(button);
  });

  CCD.ADDONS.forEach(function (addon) {
    var label = document.createElement('label');
    label.className = 'addon';
    label.innerHTML =
      '<input type="checkbox" value="' + addon.id + '">' +
      '<span class="addon-label">' + addon.label + '</span>' +
      '<span class="addon-price">' + CCD.money(addon.price) + '</span>';
    label.querySelector('input').addEventListener('change', function (event) {
      if (event.target.checked) state.addons.push(addon.id);
      else state.addons = state.addons.filter(function (id) { return id !== addon.id; });
      label.classList.toggle('is-on', event.target.checked);
      renderQuote();
    });
    addonBox.appendChild(label);
  });

  // Reflects the current selection, and shows package prices for the chosen vehicle.
  function syncChoices() {
    vehicleBox.querySelectorAll('.choice').forEach(function (el) {
      el.classList.toggle('is-on', el.dataset.id === state.vehicle);
    });
    packageBox.querySelectorAll('.choice').forEach(function (el) {
      el.classList.toggle('is-on', el.dataset.id === state.package);
      var pkg = CCD.PACKAGES.filter(function (p) { return p.id === el.dataset.id; })[0];
      var price = el.querySelector('[data-price]');
      price.textContent = state.vehicle ? CCD.money(pkg.prices[state.vehicle]) : 'Pick a size';
    });
  }

  function renderQuote() {
    var quote = CCD.quote(state.vehicle, state.package, state.addons);
    linesBox.innerHTML = '';

    if (!quote.lines.length) {
      linesBox.innerHTML = '<li class="quote-empty">Choose a vehicle size and package to see your price.</li>';
      totalBox.textContent = '$0';
      return;
    }

    quote.lines.forEach(function (line) {
      var li = document.createElement('li');
      li.innerHTML = '<span>' + line.description + '</span><b>' + CCD.money(line.total) + '</b>';
      linesBox.appendChild(li);
    });
    totalBox.textContent = CCD.money(quote.total);
  }

  syncChoices();

  /* ------------------------------------------------------------- submit -- */

  function showMessage(text, kind) {
    message.textContent = text;
    message.className = 'form-message is-' + kind;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    var data = new FormData(form);
    var payload = {
      name: (data.get('name') || '').trim(),
      phone: (data.get('phone') || '').trim(),
      email: (data.get('email') || '').trim(),
      vehicle: state.vehicle,
      vehicleDesc: (data.get('vehicleDesc') || '').trim(),
      package: state.package,
      addons: state.addons,
      address: (data.get('address') || '').trim(),
      preferredDate: data.get('preferredDate') || '',
      preferredTime: data.get('preferredTime') || '',
      notes: (data.get('notes') || '').trim()
    };

    if (!payload.vehicle) return showMessage('Please choose a vehicle size.', 'error');
    if (!payload.package) return showMessage('Please choose a package.', 'error');
    if (payload.name.length < 2) return showMessage('Please enter your name.', 'error');
    if (payload.phone.replace(/\D/g, '').length < 10) {
      return showMessage('Please enter a valid phone number.', 'error');
    }

    submit.disabled = true;
    submit.textContent = 'Sending…';
    showMessage('', 'idle');

    try {
      var response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Request failed');

      form.innerHTML =
        '<div class="booking-done">' +
        '<h3>Request sent — thank you!</h3>' +
        '<p>We have your details and will call or text <b>' + payload.phone + '</b> shortly to confirm your appointment.</p>' +
        '<p class="booking-done-total">Estimated total: <b>' + CCD.money(CCD.quote(payload.vehicle, payload.package, payload.addons).total) + '</b></p>' +
        '<p>Need it sooner? <a href="tel:7027200758">Call or text 702.720.0758</a></p>' +
        '</div>';
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      submit.disabled = false;
      submit.textContent = 'Request Booking';
      showMessage(err.message + ' — please call or text 702.720.0758.', 'error');
    }
  });
})();
