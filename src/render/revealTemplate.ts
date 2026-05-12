import { revealCss, revealJs, getTheme, magicMoveJs, magicMoveCss } from "./revealAssets";

export interface SlideHtml {
  /** Pre-rendered HTML for the slide body (markdown already converted). */
  body: string;
  /** Pre-rendered HTML for speaker notes, or undefined. */
  noteHtml?: string;
  /**
   * Optional slide-level HTML attributes to put on the `<section>` tag.
   * Produced by the `<!-- slide attr=val -->` annotation parser; consumed
   * here by interpolating into the opening tag.
   */
  sectionAttrs?: string;
}

export interface DeckRenderOptions {
  theme?: string;
  transition?: string;
  slideNumber?: boolean;
  /**
   * If true (default), Reveal is initialised with `embedded: true` —
   * controls hidden, no fullscreen by default. Use this for the in-Obsidian
   * iframe preview. Set to false for the standalone export (the user's
   * default browser opens a fullscreen-capable deck via the F key).
   */
  embedded?: boolean;
  // Pass-through reveal.js Reveal.initialize() options if the caller
  // wants to override anything specific.
  revealOptions?: Record<string, unknown>;
}

/**
 * Build a complete, self-contained HTML document for the iframe-srcdoc
 * preview. The output bakes in reveal.js + theme CSS as inline content;
 * the iframe never makes a network request.
 */
export function buildIframeHtml(
  slides: SlideHtml[],
  options: DeckRenderOptions = {}
): string {
  const theme = getTheme(options.theme);
  const transition = options.transition ?? "slide";
  const slideNumber = options.slideNumber ?? false;
  const embedded = options.embedded ?? true;
  const userOptions = options.revealOptions ?? {};

  const sectionsHtml = slides
    .map((s) => {
      const attrs = s.sectionAttrs ? " " + s.sectionAttrs : "";
      const note = s.noteHtml
        ? `\n      <aside class="notes">${s.noteHtml}</aside>`
        : "";
      return `    <section${attrs}>\n      ${s.body}${note}\n    </section>`;
    })
    .join("\n");

  // Reveal.initialize() config. We stringify safely so user-supplied
  // overrides can't break out of the JSON literal.
  const initConfig = JSON.stringify({
    hash: false,
    history: false,
    keyboard: true,
    transition,
    slideNumber,
    embedded,
    // Force presentation mode. reveal.js 5 auto-activates scroll mode in
    // small embedded viewports, which rearranges section DOM and breaks
    // discrete slide navigation (Reveal.slide() scrolls instead of
    // jumping). Slide decks want discrete transitions.
    view: "presentation",
    scrollActivationWidth: 0,
    // In standalone mode show reveal's built-in controls and progress
    // bar; in embedded mode they're hidden by default.
    controls: !embedded,
    progress: !embedded,
    ...userOptions,
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>slides-ng preview</title>
  <style>
    /* reveal.js core */
    ${revealCss}
  </style>
  <style>
    /* theme */
    ${theme}
  </style>
  <style>
    /* slides-ng iframe overrides */
    html, body { margin: 0; padding: 0; height: 100%; background: var(--r-background-color, #111); }
    .reveal { height: 100%; }

    /* Slidev-style code line-stepping (M5). All step blocks live in the
     * same grid cell so they stack visually. Step 0 is visible by default.
     * Reveal.js adds the classes fragment + visible + current-fragment to
     * whichever fragment the presenter just clicked; we use that to control
     * which step is shown. */
    .line-step-container {
      display: grid;
      position: relative;
    }
    .line-step-container > .line-step-step {
      grid-column: 1;
      grid-row: 1;
      transition: opacity 0.18s ease;
    }
    .line-step-step.fragment.line-step-fade {
      opacity: 0;
      visibility: visible; /* override reveal's default visibility:hidden */
    }
    .line-step-step.fragment.line-step-fade.visible.current-fragment {
      opacity: 1;
    }
    /* When any later step is the current fragment, hide step 0. */
    .line-step-container:has(.fragment.current-fragment) > .line-step-step:not(.fragment) {
      opacity: 0;
    }
    /* When a later step is visible but no longer current (presenter has
     * stepped past it), keep it hidden too. */
    .line-step-step.fragment.line-step-fade.visible:not(.current-fragment) {
      opacity: 0;
    }
    /* Dimmed lines within a step (Shiki transformer marks them). */
    .line-step-step .shiki .line.line-dim {
      opacity: 0.32;
      transition: opacity 0.2s ease;
    }

    /* ----------------------------------------------------------------
     * Slidev-flavoured layouts (v0.2).
     * Each <section> wraps its content in
     *   <div class="slides-ng-layout" data-layout="<name>">
     * and each layout uses sub-classes (e.g. .slides-ng-cols-2) for its
     * specific structure.
     * --------------------------------------------------------------- */

    .slides-ng-layout {
      width: 100%;
      height: 100%;
    }

    /* center: vertically + horizontally centered content */
    .slides-ng-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      height: 100%;
    }

    /* cover: title-slide style, larger type, centered */
    .slides-ng-cover {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      height: 100%;
      padding: 0 5%;
    }
    .slides-ng-cover h1 {
      font-size: 1.5em;
      letter-spacing: -0.01em;
      margin-bottom: 0.4em;
    }
    .slides-ng-cover h2,
    .slides-ng-cover h3 {
      font-weight: 400;
      opacity: 0.75;
    }

    /* two-cols: two equal columns side by side */
    .slides-ng-cols-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      align-items: start;
      width: 100%;
      height: 100%;
    }
    .slides-ng-cols-2 .slides-ng-col {
      min-width: 0;
      overflow: hidden;
    }

    /* two-cols-header: header on top, two columns below */
    .slides-ng-cols-2-header {
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 1rem;
      height: 100%;
    }
    .slides-ng-cols-2-header .slides-ng-cols-wrap {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      align-items: start;
      min-height: 0;
    }
    .slides-ng-cols-2-header .slides-ng-col {
      min-width: 0;
    }

    /* quote: large blockquote */
    .slides-ng-quote {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      height: 100%;
      padding: 0 8%;
    }
    .slides-ng-quote > blockquote,
    .slides-ng-quote blockquote {
      font-size: 1.15em;
      font-style: italic;
      border-left: 0;
      padding: 0;
    }

    /* statement: single large emphasised statement */
    .slides-ng-statement {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      height: 100%;
      font-size: 1.4em;
      font-weight: 600;
      letter-spacing: -0.01em;
      padding: 0 8%;
    }

    /* section: chapter-divider style */
    .slides-ng-section {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      height: 100%;
      padding: 0 8%;
    }
    .slides-ng-section h1,
    .slides-ng-section h2 {
      font-size: 1.6em;
      letter-spacing: -0.02em;
    }

    /* end: closing slide, large centered text */
    .slides-ng-end {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      height: 100%;
      font-size: 1.8em;
      font-weight: 700;
      letter-spacing: -0.02em;
      padding: 0 5%;
    }

    /* image-left / image-right: side-by-side image + content */
    .slides-ng-image-left,
    .slides-ng-image-right {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      align-items: center;
      height: 100%;
    }
    .slides-ng-image-side {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      overflow: hidden;
    }
    .slides-ng-image-side img,
    .slides-ng-image-side .slides-ng-image {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
    }
    .slides-ng-image-content {
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: 100%;
      overflow: hidden;
    }

    /* image (full-bleed): image fills the slide; content overlays it */
    .slides-ng-image-full {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .slides-ng-image-bg {
      position: absolute;
      inset: 0;
    }
    .slides-ng-image-bg img,
    .slides-ng-image-bg .slides-ng-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .slides-ng-image-overlay {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      height: 100%;
      color: white;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
      padding: 0 5%;
    }
  </style>
  <style>
    /* shiki-magic-move v0.4 — token-morph between paired code blocks */
    ${magicMoveCss}
    .slides-ng-magic-move {
      width: 100%;
    }
  </style>
</head>
<body>
  <div class="reveal">
    <div class="slides">
${sectionsHtml}
    </div>
  </div>
  <script>
    ${revealJs}
  </script>
  <script>
    (function () {
      try {
        Reveal.initialize(${initConfig});
      } catch (err) {
        document.body.innerHTML = '<pre style="color:#f99;padding:1em;font-family:monospace;white-space:pre-wrap">slides-ng: reveal.js failed to initialize\\n' + (err && err.stack ? String(err.stack) : String(err)) + '</pre>';
      }
    })();
  </script>
  <script>
    ${magicMoveJs}
  </script>
  <script>
    /* Magic-Move bootstrap. Finds all .slides-ng-magic-move elements,
       groups them by data-mm-key, and on reveal.js slidechanged events
       morphs the current key's renderer to the new slide's keyed tokens. */
    (function () {
      if (!window.SlidesNgMagicMove) return;
      var renderers = new Map(); // key → { renderer, lastKey }
      var allMarkers = Array.from(document.querySelectorAll('.slides-ng-magic-move'));
      allMarkers.forEach(function (el) {
        var key = el.getAttribute('data-mm-key');
        var tokensJson = el.getAttribute('data-mm-tokens');
        if (!key || !tokensJson) return;
        try {
          var tokens = JSON.parse(tokensJson);
          var existing = renderers.get(key);
          if (!existing) {
            // First marker for this key — install a renderer + render
            // the initial state into the same DOM slot.
            el.innerHTML = '';
            var renderer = new window.SlidesNgMagicMove.MagicMoveRenderer(el);
            renderer.render(tokens);
            renderers.set(key, { renderer: renderer, tokens: tokens, elements: [el] });
          } else {
            // Subsequent marker for the same key — track it for later morph.
            existing.elements.push(el);
            // Pre-render the initial state for visual correctness when reveal
            // is first viewing this slide.
            el.innerHTML = '';
            var laterRenderer = new window.SlidesNgMagicMove.MagicMoveRenderer(el);
            laterRenderer.render(tokens);
          }
        } catch (e) {
          console.warn('[slides-ng] magic-move bootstrap failed for key', key, e);
        }
      });

      // When reveal advances to a slide containing a magic-move element,
      // animate the renderer for THAT key to this slide's tokens.
      Reveal.on('slidechanged', function () {
        var current = Reveal.getCurrentSlide();
        if (!current) return;
        var markers = current.querySelectorAll('.slides-ng-magic-move');
        markers.forEach(function (el) {
          var key = el.getAttribute('data-mm-key');
          var tokensJson = el.getAttribute('data-mm-tokens');
          if (!key || !tokensJson) return;
          try {
            var tokens = JSON.parse(tokensJson);
            var entry = renderers.get(key);
            if (!entry) return;
            // Run the morph on the original renderer (the one installed
            // for the first marker with this key). This is the element
            // that will animate — the later markers are non-interactive
            // placeholders.
            entry.renderer.render(tokens);
          } catch (e) {
            console.warn('[slides-ng] magic-move slidechanged failed', e);
          }
        });
      });
    })();
  </script>
  <script>
    /* postMessage bridge for the in-Obsidian Speaker Console (v0.5).
     * Listens for navigation commands from the parent window and posts
     * state-change events back so the speaker view stays in sync. */
    (function () {
      function harvestSlideMeta() {
        // Robust regardless of reveal view mode: gather all sections under
        // .reveal, then keep only horizontal (top-level) ones — a top-level
        // section has no <section> ancestor under .reveal.
        var all = Array.from(document.querySelectorAll('.reveal section'));
        var horizontals = all.filter(function (s) {
          var p = s.parentElement;
          while (p && !p.classList.contains('reveal')) {
            if (p.tagName === 'SECTION') return false;
            p = p.parentElement;
          }
          return true;
        });
        return horizontals.map(function (s, idx) {
          var titleEl = s.querySelector('h1, h2, h3');
          var title = titleEl ? titleEl.innerText.trim().slice(0, 80) : '';
          return { idx: idx, title: title };
        });
      }
      function currentState() {
        if (typeof Reveal === 'undefined') return null;
        var indices = Reveal.getIndices();
        var current = Reveal.getCurrentSlide();
        var totalSlides = Reveal.getTotalSlides();
        var notesEl = current ? current.querySelector('aside.notes') : null;
        var nextSlide = null;
        try { nextSlide = Reveal.getSlide(indices.h + 1, 0); } catch (e) { nextSlide = null; }
        var nextTitleEl = nextSlide ? nextSlide.querySelector('h1, h2, h3') : null;
        var blackoutEl = document.getElementById('slides-ng-blackout');
        return {
          type: 'slides-ng-state',
          currentIdx: indices.h,
          fragmentIdx: indices.f != null ? indices.f : -1,
          totalSlides: totalSlides,
          isBlackout: !!(blackoutEl && blackoutEl.classList.contains('on')),
          notesHtml: notesEl ? notesEl.innerHTML : '',
          nextTitle: nextTitleEl ? nextTitleEl.innerText.trim().slice(0, 80) : '',
          slides: harvestSlideMeta()
        };
      }
      function postState() {
        var state = currentState();
        if (state && window.parent && window.parent !== window) {
          window.parent.postMessage(state, '*');
        }
      }
      function ensureBlackoutEl() {
        var el = document.getElementById('slides-ng-blackout');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'slides-ng-blackout';
        el.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999;display:none;';
        document.body.appendChild(el);
        return el;
      }
      window.addEventListener('message', function (event) {
        var data = event.data;
        if (!data || data.type !== 'slides-ng-cmd' || typeof Reveal === 'undefined') return;
        try {
          switch (data.cmd) {
            case 'next':   Reveal.next();   break;
            case 'prev':   Reveal.prev();   break;
            case 'first':  Reveal.slide(0); break;
            case 'last':   Reveal.slide(Reveal.getTotalSlides() - 1); break;
            case 'goto':   if (typeof data.idx === 'number') Reveal.slide(data.idx); break;
            case 'toggleBlackout': {
              var el = ensureBlackoutEl();
              if (el.classList.contains('on')) {
                el.classList.remove('on');
                el.style.display = 'none';
              } else {
                el.classList.add('on');
                el.style.display = 'block';
              }
              postState();
              break;
            }
            case 'requestState': postState(); break;
          }
        } catch (e) {
          console.warn('[slides-ng] postMessage command failed', e);
        }
      });
      function attachListeners() {
        if (typeof Reveal === 'undefined') {
          setTimeout(attachListeners, 50);
          return;
        }
        Reveal.on('ready', postState);
        Reveal.on('slidechanged', postState);
        Reveal.on('fragmentshown', postState);
        Reveal.on('fragmenthidden', postState);
        // Initial post in case 'ready' has already fired before this attaches.
        setTimeout(postState, 100);
      }
      attachListeners();
    })();
  </script>
</body>
</html>`;
}
