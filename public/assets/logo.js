/* Logo lockup.
 *
 * Every logo slot on the site is marked with data-ccd-logo. Each one prefers the
 * real artwork at images/logo.png and falls back to the vector lockup below if
 * that file isn't in the repo yet — so the brand never renders as bare text.
 *
 * Drop the real logo.png into public/images/ and it takes over everywhere
 * automatically; nothing here needs changing.
 */
(function () {
  var SVG =
    '<svg class="ccd-mark" viewBox="0 0 660 372" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Coolcare Details">' +
      '<defs>' +
        '<linearGradient id="ccdChrome" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#ffffff"/><stop offset="26%" stop-color="#e4e4e4"/>' +
          '<stop offset="47%" stop-color="#8a8a8a"/><stop offset="53%" stop-color="#ffffff"/>' +
          '<stop offset="78%" stop-color="#6b6b6b"/><stop offset="100%" stop-color="#d2d2d2"/>' +
        '</linearGradient>' +
        '<linearGradient id="ccdRed" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#ff4450"/><stop offset="45%" stop-color="#c1121f"/>' +
          '<stop offset="100%" stop-color="#5c0a11"/>' +
        '</linearGradient>' +
        '<linearGradient id="ccdBody" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#2a2a2e"/><stop offset="55%" stop-color="#0d0d0f"/>' +
          '<stop offset="100%" stop-color="#000000"/>' +
        '</linearGradient>' +
      '</defs>' +

      /* pinstripe crown — right half drawn once, mirrored for the left */
      '<g fill="none" stroke-linecap="round">' +
        '<g id="ccdCrown">' +
          '<path d="M330 24 C346 66 352 100 342 134" stroke="url(#ccdRed)" stroke-width="7"/>' +
          '<path d="M330 40 C352 74 362 104 356 138" stroke="#cfcfcf" stroke-width="3.5"/>' +
          '<path d="M330 58 C300 92 262 108 214 110" stroke="url(#ccdRed)" stroke-width="5"/>' +
          '<path d="M348 92 C396 100 452 116 498 142" stroke="url(#ccdRed)" stroke-width="6"/>' +
          '<path d="M360 116 C420 122 486 134 540 156" stroke="#b8b8b8" stroke-width="3"/>' +
          '<path d="M470 118 C528 120 580 128 622 142" stroke="url(#ccdRed)" stroke-width="4.5"/>' +
          '<path d="M498 142 C556 146 600 154 634 164" stroke="#9a9a9a" stroke-width="2.5"/>' +
        '</g>' +
        '<use href="#ccdCrown" transform="translate(660,0) scale(-1,1)"/>' +
        '<path d="M330 16 C330 60 330 96 330 132" stroke="url(#ccdRed)" stroke-width="8"/>' +
        '<path d="M330 30 C324 72 324 104 330 136" stroke="#e8e8e8" stroke-width="3"/>' +
        '<path d="M330 30 C336 72 336 104 330 136" stroke="#e8e8e8" stroke-width="3"/>' +
      '</g>' +

      /* body shield */
      '<path d="M330 104 C476 104 606 138 638 196 C606 254 476 288 330 288 ' +
        'C184 288 54 254 22 196 C54 138 184 104 330 104 Z" ' +
        'fill="url(#ccdBody)" stroke="url(#ccdRed)" stroke-width="4"/>' +
      '<path d="M330 116 C466 116 588 146 618 196 C588 246 466 276 330 276 ' +
        'C194 276 72 246 42 196 C72 146 194 116 330 116 Z" ' +
        'fill="none" stroke="rgba(220,220,220,.45)" stroke-width="1.6"/>' +

      /* red sweep behind the wordmark */
      '<path d="M74 232 C210 258 450 258 586 232 C450 248 210 248 74 232 Z" fill="url(#ccdRed)"/>' +

      /* wordmark */
      '<text class="ccd-script" x="330" y="212" text-anchor="middle" fill="url(#ccdChrome)" ' +
        'stroke="rgba(0,0,0,.55)" stroke-width="1.4" paint-order="stroke">Coolcare</text>' +
      '<text class="ccd-details" x="330" y="262" text-anchor="middle" fill="url(#ccdChrome)">DETAILS</text>' +

      /* bottom tail */
      '<g fill="none" stroke-linecap="round">' +
        '<path d="M330 288 C330 318 330 344 330 366" stroke="url(#ccdRed)" stroke-width="7"/>' +
        '<path d="M330 290 C316 316 308 336 306 356" stroke="#cfcfcf" stroke-width="3"/>' +
        '<path d="M330 290 C344 316 352 336 354 356" stroke="#cfcfcf" stroke-width="3"/>' +
        '<path d="M258 292 C286 312 310 332 324 356" stroke="url(#ccdRed)" stroke-width="3.5"/>' +
        '<path d="M402 292 C374 312 350 332 336 356" stroke="url(#ccdRed)" stroke-width="3.5"/>' +
      '</g>' +
    '</svg>';

  function mount(slot) {
    var alt = slot.getAttribute('data-logo-alt') || 'Coolcare Details';
    var image = new Image();

    image.onload = function () {
      slot.innerHTML = '';
      image.alt = alt;
      image.className = 'ccd-logo-img';
      slot.appendChild(image);
      slot.classList.remove('has-vector');
      slot.classList.add('has-artwork');
      document.documentElement.classList.add('ccd-has-logo');
    };
    image.onerror = function () {
      slot.innerHTML = SVG;
      slot.classList.add('has-vector');
    };

    // Render the vector immediately so nothing flashes empty while the PNG loads.
    slot.innerHTML = SVG;
    slot.classList.add('has-vector');
    image.src = slot.getAttribute('data-ccd-logo') || 'images/logo.png';
  }

  function init() {
    document.querySelectorAll('[data-ccd-logo]').forEach(mount);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
