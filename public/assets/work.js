/* Full "Our Work" gallery.
 *
 * Probes images/work/1..MAX (jpg/webp/png) and renders every photo found, in
 * order. If none exist yet, a friendly note points visitors to Instagram and
 * the booking form so the page never looks broken.
 */
(function () {
  var grid = document.getElementById('work-grid');
  if (!grid) return;

  var MAX = 40;
  var EXTENSIONS = ['jpg', 'webp', 'png', 'jpeg'];
  var slots = [];
  var pending = MAX;

  for (var i = 1; i <= MAX; i++) probe(i);

  function probe(slot) {
    attempt(slot, 0);
  }

  function attempt(slot, extIndex) {
    if (extIndex >= EXTENSIONS.length) { done(); return; }
    var img = new Image();
    img.onload = function () {
      slots.push({ slot: slot, img: img });
      img.alt = 'Coolcare Details detailing result';
      img.loading = 'lazy';
      done();
    };
    img.onerror = function () { attempt(slot, extIndex + 1); };
    img.src = 'images/work/' + slot + '.' + EXTENSIONS[extIndex];
  }

  // Render once every slot has resolved, so tiles stay in numeric order.
  function done() {
    if (--pending > 0) return;
    slots.sort(function (a, b) { return a.slot - b.slot; });

    if (!slots.length) {
      document.getElementById('work-empty').hidden = false;
      return;
    }

    slots.forEach(function (entry) {
      var tile = document.createElement('div');
      tile.className = 'work-tile';
      tile.appendChild(entry.img);
      grid.appendChild(tile);
    });
  }
})();
