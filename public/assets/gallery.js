/* Instagram gallery.
 *
 * There is no live Instagram feed here on purpose — that needs an API token
 * that expires and has to be re-issued. Instead the grid fills itself from
 * whatever photos exist in public/images/gallery/, named 1 through 6 with a
 * .jpg, .webp or .png extension. Add photos, they appear. Add none, the grid
 * stays hidden and the section still reads as finished.
 */
(function () {
  var grid = document.getElementById('ig-grid');
  if (!grid) return;

  var PROFILE = 'https://www.instagram.com/coolcare_details';
  var SLOTS = 6;
  var EXTENSIONS = ['jpg', 'webp', 'png', 'jpeg'];

  var found = 0;

  function tryLoad(slot, extIndex) {
    if (extIndex >= EXTENSIONS.length) return;

    var src = 'images/gallery/' + slot + '.' + EXTENSIONS[extIndex];
    var probe = new Image();

    probe.onload = function () {
      var tile = document.createElement('a');
      tile.className = 'ig-tile';
      tile.href = PROFILE;
      tile.target = '_blank';
      tile.rel = 'noopener';
      tile.style.order = String(slot);
      probe.alt = 'Coolcare Details work in progress';
      probe.loading = 'lazy';
      tile.appendChild(probe);
      grid.appendChild(tile);

      if (!found++) {
        grid.hidden = false;
        grid.closest(".ig-panel").classList.add("has-gallery");
      }
    };

    probe.onerror = function () { tryLoad(slot, extIndex + 1); };
    probe.src = src;
  }

  for (var i = 1; i <= SLOTS; i++) tryLoad(i, 0);
})();
