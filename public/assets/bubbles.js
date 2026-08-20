/* Drifting wash-bubble background for the homepage.
   Purely decorative: sits behind all content, ignores pointer events, and
   stands still for visitors who ask for reduced motion. */
(function () {
  var layer = document.querySelector('.bubbles');
  if (!layer) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function rand(min, max) { return min + Math.random() * (max - min); }

  function build() {
    layer.innerHTML = '';

    // Fewer, larger bubbles on narrow screens so phones stay smooth.
    var width = window.innerWidth;
    var count = width < 640 ? 12 : width < 1100 ? 18 : 26;

    for (var i = 0; i < count; i++) {
      var size = rand(16, 88);
      var bubble = document.createElement('span');
      bubble.className = 'bubble' + (Math.random() < 0.28 ? ' is-tinted' : '');

      // Bigger bubbles drift slower and sit fainter, which reads as depth.
      var depth = (size - 16) / 72;
      bubble.style.cssText = [
        'width:' + size.toFixed(1) + 'px',
        'height:' + size.toFixed(1) + 'px',
        'left:' + rand(-2, 100).toFixed(2) + '%',
        '--peak:' + (0.8 - depth * 0.32).toFixed(2),
        '--drift:' + rand(-70, 70).toFixed(0) + 'px',
        '--sway:' + rand(12, 34).toFixed(0) + 'px',
        'animation-duration:' + rand(17, 34).toFixed(1) + 's',
        'animation-delay:' + (-rand(0, 30)).toFixed(1) + 's'
      ].join(';');

      layer.appendChild(bubble);
    }
  }

  build();

  if (reduced) return;

  // Rebuild on meaningful width changes so density suits the new viewport.
  var lastWidth = window.innerWidth;
  var timer;
  window.addEventListener('resize', function () {
    if (Math.abs(window.innerWidth - lastWidth) < 120) return;
    lastWidth = window.innerWidth;
    clearTimeout(timer);
    timer = setTimeout(build, 250);
  });
})();
