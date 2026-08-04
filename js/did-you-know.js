/**
 * "Did you know?" — a small side card that introduces visitors to Pando,
 * our namesake: the largest and heaviest living organism on Earth, a single
 * connected aspen grove right here in Utah.
 *
 * Self-contained: injects its own styles and markup. Slides in from the
 * right after the visitor scrolls past the hero; shows once per session.
 */
(function () {
  var KEY = 'pandoDidYouKnowShown';
  try {
    if (sessionStorage.getItem(KEY)) return;
  } catch (e) { /* private browsing — just show it */ }

  var css = [
    '.dyk-card {',
    '  position: fixed;',
    '  right: 20px;',
    '  bottom: 24px;',
    '  width: 340px;',
    '  max-width: calc(100vw - 24px);',
    '  background: linear-gradient(160deg, #FDFBF5 0%, #F4EEDF 100%);',
    '  border: 1px solid rgba(15, 45, 77, 0.12);',
    '  border-top: 3px solid #C9973D;',
    '  border-radius: 14px;',
    '  box-shadow: 0 18px 48px rgba(15, 45, 77, 0.22);',
    '  padding: 20px 22px 18px;',
    '  z-index: 1001;',
    '  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;',
    '  transform: translateX(calc(100% + 40px));',
    '  opacity: 0;',
    '  transition: transform 0.7s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.7s ease;',
    '}',
    '.dyk-card.dyk-in { transform: translateX(0); opacity: 1; }',
    '.dyk-card.dyk-out { transform: translateX(calc(100% + 40px)); opacity: 0; }',
    '.dyk-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }',
    '.dyk-head img {',
    '  width: 44px; height: 44px; border-radius: 50%;',
    '  background: #FFFFFF; border: 1px solid rgba(94, 124, 91, 0.35);',
    '  object-fit: cover; flex-shrink: 0;',
    '}',
    '.dyk-eyebrow {',
    '  font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase;',
    '  color: #C9973D; font-weight: 700; margin: 0 0 2px;',
    '}',
    '.dyk-title { font-size: 1.05rem; font-weight: 700; color: #0F2D4D; margin: 0; line-height: 1.2; }',
    '.dyk-body { font-size: 0.86rem; line-height: 1.55; color: #33475C; margin: 0 0 12px; }',
    '.dyk-body strong { color: #0F2D4D; }',
    '.dyk-body em { color: #5E7C5B; font-style: italic; }',
    '.dyk-link {',
    '  display: inline-block; font-size: 0.82rem; font-weight: 600;',
    '  color: #5E7C5B; text-decoration: none; border-bottom: 1px solid rgba(94, 124, 91, 0.4);',
    '  padding-bottom: 1px;',
    '}',
    '.dyk-link:hover { color: #0F2D4D; border-bottom-color: #C9973D; }',
    '.dyk-close {',
    '  position: absolute; top: 10px; right: 12px;',
    '  background: none; border: none; cursor: pointer;',
    '  font-size: 1.15rem; line-height: 1; color: rgba(15, 45, 77, 0.45);',
    '  padding: 4px;',
    '}',
    '.dyk-close:hover { color: #0F2D4D; }',
    '@media (max-width: 640px) {',
    '  .dyk-card { right: 12px; left: 12px; bottom: 16px; width: auto; padding: 18px 18px 16px; }',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '  .dyk-card { transition: opacity 0.4s ease; transform: none; }',
    '  .dyk-card.dyk-out { transform: none; }',
    '}'
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var card = document.createElement('aside');
  card.className = 'dyk-card';
  card.setAttribute('role', 'complementary');
  card.setAttribute('aria-label', 'Did you know? About Pando');
  card.innerHTML =
    '<button class="dyk-close" type="button" aria-label="Dismiss">&times;</button>' +
    '<div class="dyk-head">' +
    '  <img src="images/pando_emblem.png" alt="Pando aspen grove emblem">' +
    '  <div>' +
    '    <p class="dyk-eyebrow">Our Namesake</p>' +
    '    <h4 class="dyk-title">Did you know?</h4>' +
    '  </div>' +
    '</div>' +
    '<p class="dyk-body">' +
    '  <strong>Pando</strong> &mdash; Latin for <em>&ldquo;I spread&rdquo;</em> &mdash; is a grove of' +
    '  roughly 47,000 aspen trees in central Utah that are all <strong>one single living' +
    '  organism</strong>, sharing one vast root system. It&rsquo;s the largest and heaviest' +
    '  living thing on Earth &mdash; and it&rsquo;s right in our backyard.' +
    '  Its ability to stay connected is what inspires everything we do.' +
    '</p>' +
    '<a class="dyk-link" href="https://en.wikipedia.org/wiki/Pando_(tree)" target="_blank" rel="noopener">' +
    '  Read more about Pando &rarr;</a>';

  function show() {
    if (document.body.contains(card)) return;
    document.body.appendChild(card);
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
    // Next frame so the entry transition runs
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { card.classList.add('dyk-in'); });
    });
  }

  function dismiss() {
    card.classList.remove('dyk-in');
    card.classList.add('dyk-out');
    setTimeout(function () { card.remove(); }, 800);
  }

  card.querySelector('.dyk-close').addEventListener('click', dismiss);

  // Reveal once the visitor has scrolled past the first screen (or after a
  // long dwell, for pages they read without scrolling).
  var revealed = false;
  function maybeReveal() {
    if (revealed) return;
    if (window.scrollY > window.innerHeight * 0.85) {
      revealed = true;
      window.removeEventListener('scroll', maybeReveal);
      setTimeout(show, 400);
    }
  }
  window.addEventListener('scroll', maybeReveal, { passive: true });
  setTimeout(function () {
    if (!revealed) { revealed = true; window.removeEventListener('scroll', maybeReveal); show(); }
  }, 25000);
})();
