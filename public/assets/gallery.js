/* Homepage Instagram showcase.
 *
 * Three sources, tried in order:
 *   1. Real Instagram posts, if links are listed in instagram-posts.js. These
 *      render through Instagram's own embed script, so captions and likes stay
 *      current and nothing needs re-uploading when a post changes.
 *   2. Photos in images/gallery/ named 1..6 with a .jpg/.webp/.png extension.
 *   3. Neither — the grid stays hidden and the follow panel centres itself.
 *
 * Instagram's script is only fetched when there is at least one post to show,
 * so visitors are not sent to a third party for nothing.
 */
(function () {
  var grid = document.getElementById('ig-grid');
  if (!grid) return;

  var PROFILE = 'https://www.instagram.com/coolcare_details';
  var panel = grid.closest('.ig-panel');

  function reveal(modifier) {
    grid.hidden = false;
    grid.classList.add(modifier);
    if (panel) {
      panel.classList.add('has-gallery');
      if (modifier === 'is-embeds') panel.classList.add('has-embeds');
    }
  }

  /* --------------------------------------------------------- real posts -- */

  // Accepts a post, reel or IGTV link and drops any tracking query string.
  function normalisePermalink(url) {
    var match = String(url || '').trim()
      .match(/^https?:\/\/(?:www\.)?instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
    if (!match) return null;
    var kind = match[1].toLowerCase() === 'reels' ? 'reel' : match[1].toLowerCase();
    return 'https://www.instagram.com/' + kind + '/' + match[2] + '/';
  }

  function renderPosts(permalinks) {
    permalinks.forEach(function (link) {
      var quote = document.createElement('blockquote');
      quote.className = 'instagram-media';
      quote.setAttribute('data-instgrm-permalink', link);
      quote.setAttribute('data-instgrm-version', '14');
      quote.style.margin = '0';
      quote.style.width = '100%';
      // Shown only until Instagram's script swaps in the real post.
      quote.innerHTML = '<a href="' + link + '" target="_blank" rel="noopener">View this post on Instagram</a>';
      grid.appendChild(quote);
    });

    reveal('is-embeds');

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.instagram.com/embed.js';
    script.onload = function () {
      if (window.instgrm && window.instgrm.Embeds) window.instgrm.Embeds.process();
    };
    document.body.appendChild(script);
  }

  /* ------------------------------------------------------ local photos -- */

  function renderPhotos() {
    var SLOTS = 6;
    var EXTENSIONS = ['jpg', 'webp', 'png', 'jpeg'];
    var found = 0;

    function attempt(slot, extIndex) {
      if (extIndex >= EXTENSIONS.length) return;
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
        if (!found++) reveal('is-photos');
      };

      probe.onerror = function () { attempt(slot, extIndex + 1); };
      probe.src = 'images/gallery/' + slot + '.' + EXTENSIONS[extIndex];
    }

    for (var i = 1; i <= SLOTS; i++) attempt(i, 0);
  }

  /* -------------------------------------------------------------- start -- */

  var configured = (window.CCD_INSTAGRAM_POSTS || [])
    .map(normalisePermalink)
    .filter(Boolean)
    .slice(0, 6);

  if (configured.length) renderPosts(configured);
  else renderPhotos();
})();
