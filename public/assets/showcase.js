/* Homepage "See The Work" strip.
 *
 * Fills four tiles from photos in images/work/ named 1..8 (jpg/webp/png),
 * newest-looking first. Any slot without a file shows a branded placeholder,
 * so the strip always looks intentional even before real photos are added.
 * The full set lives on /work.
 */
(function () {
  var strip = document.getElementById('showcase-strip');
  if (!strip) return;

  var TILES = 4;
  var EXTENSIONS = ['jpg', 'webp', 'png', 'jpeg'];

  for (var i = 1; i <= TILES; i++) build(i);

  function build(slot) {
    var link = document.createElement('a');
    link.className = 'shot is-placeholder';
    link.href = '/work';
    link.setAttribute('aria-label', 'See more of our detailing work');
    strip.appendChild(link);

    tryLoad(link, slot, 0);
  }

  function tryLoad(link, slot, extIndex) {
    if (extIndex >= EXTENSIONS.length) return; // keep the placeholder
    var img = new Image();
    img.onload = function () {
      img.alt = 'Coolcare Details detailing result';
      img.loading = 'lazy';
      link.classList.remove('is-placeholder');
      link.innerHTML = '';
      link.appendChild(img);
    };
    img.onerror = function () { tryLoad(link, slot, extIndex + 1); };
    img.src = 'images/work/' + slot + '.' + EXTENSIONS[extIndex];
  }
})();
