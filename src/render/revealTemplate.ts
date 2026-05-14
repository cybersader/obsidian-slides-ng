import {
  revealCss,
  revealJs,
  getTheme,
  magicMoveJs,
  magicMoveCss,
  revealMenuJs,
  revealMenuCss,
} from "./revealAssets";

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
  /** Show reveal's controls + progress bar even in embedded mode. */
  showRevealControlsEmbedded?: boolean;
  /** Show reveal.js-menu hamburger plugin in embedded mode. */
  showRevealMenuEmbedded?: boolean;
  /** Column split ratio for image-left / image-right layouts. */
  imageLayoutSplit?: "50/50" | "60/40" | "40/60";
  /** Line-step dimming opacity (0–1). */
  lineStepDimOpacity?: number;
  /** Max-height for code blocks (CSS length, or `"none"`). */
  codeBlockMaxHeight?: string;
  /** Whether code blocks scroll overflow when capped. */
  codeBlockOverflowScroll?: boolean;
  /** Reveal animation pace. */
  transitionSpeed?: "default" | "fast" | "slow";
  /** Magic-Move animation duration in ms. */
  magicMoveDurationMs?: number;
  /** PDF-export width override (px). Passed to Reveal.initialize. */
  pdfAspectWidth?: number;
  /** PDF-export height override (px). Passed to Reveal.initialize. */
  pdfAspectHeight?: number;
  /** Custom CSS rules to inject as the last <style> block. */
  customCSS?: string;
  /**
   * When true (default), scene overlays (Blackout, BRB, Q&A, etc.)
   * inherit the deck theme's body background + text color so the
   * scene visually matches the slide. When false, they fall back
   * to the v0.7-era hardcoded black-on-white. v0.11.13+.
   */
  sceneInheritThemeBg?: boolean;
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
  const showControlsEmbedded = options.showRevealControlsEmbedded ?? false;
  const showMenuEmbedded = options.showRevealMenuEmbedded ?? false;
  const imageSplit = options.imageLayoutSplit ?? "50/50";
  const lineStepDim = options.lineStepDimOpacity ?? 0.32;
  const codeBlockMaxHeight = options.codeBlockMaxHeight ?? "60vh";
  const codeBlockOverflow = options.codeBlockOverflowScroll ?? true;
  const transitionSpeed = options.transitionSpeed ?? "default";
  const magicMoveDuration = options.magicMoveDurationMs ?? 500;
  const pdfAspectWidth = options.pdfAspectWidth;
  const pdfAspectHeight = options.pdfAspectHeight;
  const customCss = options.customCSS ?? "";
  // v0.11.13: scenes inherit the theme's body bg + text color by
  // default. Override per-deck via frontmatter
  // `slides-ng-scene-inherit-theme-bg: false`, or globally via the
  // matching plugin setting, to force a black overlay (the v0.7-era
  // default).
  const sceneInheritThemeBg = options.sceneInheritThemeBg ?? true;
  // Reveal's controls + progress bar visibility. Standalone mode always
  // shows them (helps presenters drive in a browser); embedded mode hides
  // by default but the user can opt in via setting.
  const showControls = !embedded || showControlsEmbedded;
  const showProgress = !embedded || showControlsEmbedded;
  // Reveal-menu plugin: shown in standalone always (no reason to hide it
  // when the user already opened a full browser tab) + in embedded mode
  // when the user opts in. The plugin attaches itself to window.RevealMenu
  // via UMD; init invokes it from the iframe-side inline script.
  const showMenu = !embedded || showMenuEmbedded;

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
  // overrides can't break out of the JSON literal. menu options live
  // here too — the plugin reads its config from Reveal.initialize().
  const initConfig = JSON.stringify({
    hash: false,
    history: false,
    keyboard: true,
    transition,
    transitionSpeed,
    slideNumber,
    embedded,
    // Aspect-ratio overrides for PDF export. Reveal uses width/height
    // as the design canvas — the slide content is scaled to fit any
    // viewport while preserving this aspect ratio. Only set when the
    // export pipeline asked for a non-default aspect.
    ...(typeof pdfAspectWidth === "number" ? { width: pdfAspectWidth } : {}),
    ...(typeof pdfAspectHeight === "number" ? { height: pdfAspectHeight } : {}),
    // Force presentation mode. reveal.js 5 auto-activates scroll mode in
    // small embedded viewports, which rearranges section DOM and breaks
    // discrete slide navigation (Reveal.slide() scrolls instead of
    // jumping). Slide decks want discrete transitions.
    view: "presentation",
    scrollActivationWidth: 0,
    // In standalone mode show reveal's built-in controls and progress
    // bar; in embedded mode hidden by default unless the user opts in.
    controls: showControls,
    progress: showProgress,
    menu: {
      side: "left",
      width: "normal",
      numbers: false,
      titleSelector: "h1, h2, h3, h4",
      useTextContentForMissingTitles: true,
      hideMissingTitles: false,
      markers: false,
      // We don't bundle font-awesome — disable icon mode so the menu
      // renders titles as plain text without missing-glyph squares.
      custom: false,
      themes: false,
      themesPath: "",
      transitions: false,
      openButton: true,
      openSlideNumber: false,
      keyboard: true,
      sticky: false,
      // autoOpen relates to the menu's own keyboard shortcut handling
      // in some reveal-menu builds; safer to disable so it doesn't
      // unexpectedly auto-render the menu (or its side indicators)
      // in embedded mode.
      autoOpen: false,
      delayInit: false,
      openOnInit: false,
      loadIcons: false,
    },
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
      opacity: ${lineStepDim};
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

    /* image-left / image-right: side-by-side image + content. Column
     * ratio is settings-driven: image-left puts the image on the left
     * (so 60/40 = wider image), image-right reverses it. */
    .slides-ng-image-left {
      display: grid;
      grid-template-columns: ${imageGridLeft(imageSplit)};
      gap: 2rem;
      align-items: center;
      height: 100%;
    }
    .slides-ng-image-right {
      display: grid;
      grid-template-columns: ${imageGridRight(imageSplit)};
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

    /* ----------------------------------------------------------------
     * Overview mode (the "Grid" button in the speaker view triggers
     * Reveal.toggleOverview()). Reveal's stock overview CSS collapses
     * to a single row in narrow embedded viewports and produces no
     * scroll. These overrides force a real responsive grid + each
     * tile carries the slide's aspect ratio (960×700, reveal's
     * default) + a slide-number badge. The slide CONTENT is scaled
     * via transform so the tile shows a (rough) miniature of the
     * actual slide, anchored top-left so the title is visible.
     * ---------------------------------------------------------------- */
    .reveal.overview {
      overflow-x: hidden !important;
      overflow-y: auto !important;
    }
    .reveal.overview .slides {
      display: grid !important;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      grid-auto-rows: max-content;
      gap: 1rem !important;
      padding: 1rem !important;
      position: static !important;
      width: 100% !important;
      height: auto !important;
      top: 0 !important;
      left: 0 !important;
      transform: none !important;
      perspective: none !important;
      overflow: visible !important;
      counter-reset: slides-ng-tile;
    }
    .reveal.overview .slides > section {
      position: relative !important;
      width: 100% !important;
      height: auto !important;
      aspect-ratio: 960 / 700;
      top: 0 !important;
      left: 0 !important;
      transform: none !important;
      cursor: pointer;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 6px;
      pointer-events: auto !important;
      visibility: visible !important;
      display: block !important;
    }
    .reveal.overview .slides > section.present {
      border-color: var(--r-link-color, #42affa) !important;
      border-width: 2px !important;
    }
    /* Scale slide content (the .slides-ng-layout wrapper) to fit. Reveal
     * sizes slides for 960×700 by default; tiles minimum ~240px wide;
     * scale ≈ 240/960 = 0.25. Bigger tiles will leave some empty space
     * on the right + bottom, which we accept — content stays readable
     * + identifiable. */
    .reveal.overview .slides > section > .slides-ng-layout {
      position: absolute !important;
      top: 0;
      left: 0;
      width: 960px !important;
      height: 700px !important;
      transform: scale(0.25);
      transform-origin: 0 0;
      pointer-events: none;
    }
    .reveal.overview .slides > section > aside {
      display: none !important;
    }
    /* Slide-number badge — force-shown in overview regardless of the
     * deck's slideNumber setting. */
    .reveal.overview .slides > section::after {
      counter-increment: slides-ng-tile;
      content: counter(slides-ng-tile);
      position: absolute;
      bottom: 6px;
      right: 8px;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 13px;
      font-family: var(--r-main-font, sans-serif);
      pointer-events: none;
      z-index: 5;
    }
  </style>
  <style>
    /* shiki-magic-move v0.4 — token-morph between paired code blocks */
    ${magicMoveCss}
    .slides-ng-magic-move {
      width: 100%;
    }
  </style>
  <style>
    /* Code-block max-height + internal scroll. Long blocks used to
     * overflow off the slide; now they cap at codeBlockMaxHeight and
     * scroll internally (or hide overflow if scroll is disabled). */
    ${codeBlockMaxHeight !== "none" ? `
    .reveal .shiki,
    .reveal pre code {
      max-height: ${codeBlockMaxHeight};
      overflow-y: ${codeBlockOverflow ? "auto" : "hidden"};
      overflow-x: auto;
    }` : ""}
  </style>
  ${showMenu ? `<style>
    /* reveal.js-menu plugin. font-awesome is intentionally NOT bundled
     * (would add ~100 KB for cosmetic icons); the icon-mode CSS rules
     * still reference fa- classes but those just no-op visually. The
     * menu still functions as a heading outline + slide list. */
    ${revealMenuCss}
    /* Override the menu toggle button to use a plain Unicode hamburger
     * instead of a font-awesome glyph (since we don't ship font-awesome). */
    .reveal .slide-menu-button > * { display: none; }
    .reveal .slide-menu-button::before {
      content: "\\2630";
      font-size: 22px;
      line-height: 1;
      color: white;
    }
  </style>` : ""}
  ${customCss ? `<style>
    /* customCSS from deck headmatter — last block, so it overrides
     * everything above (themes, layouts, line-step, magic-move, menu). */
    ${customCss}
  </style>` : ""}
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
  ${showMenu ? `<script>
    /* reveal.js-menu plugin (UMD). Defines window.RevealMenu. */
    ${revealMenuJs}
  </script>` : ""}
  <script>
    (function () {
      try {
        var initOpts = ${initConfig};
        ${showMenu ? `if (typeof RevealMenu !== 'undefined') {
          initOpts.plugins = (initOpts.plugins || []).concat([RevealMenu]);
        }` : ""}
        Reveal.initialize(initOpts);
      } catch (err) {
        document.body.innerHTML = '<pre style="color:#f99;padding:1em;font-family:monospace;white-space:pre-wrap">slides-ng: reveal.js failed to initialize\\n' + (err && err.stack ? String(err.stack) : String(err)) + '</pre>';
      }

      /* v0.10.2: when the iframe is mounted in a tab that's not the
         active one, the document body's clientWidth is 0 at the time
         Reveal.initialize() runs. Reveal computes slide layout from
         that, so slides render at 0x0 and the user sees a black pane
         until they switch tabs.
         Iframes DO get a 'resize' event on their inner window, BUT
         when the iframe element is resized externally (split-pane
         drag, tab activation, sidebar toggle) the event sometimes
         doesn't fire reliably across browsers — and even when it
         does, reveal's debounced layout can be skipped for
         small-percentage changes.
         Defensive fix: observe the document element with
         ResizeObserver and call Reveal.layout() + Reveal.sync()
         every time the viewport changes by more than a few pixels.
         RO fires synchronously on visibility transitions and tracks
         every meaningful resize, so this catches all the failure
         modes the user has reported. */
      (function setupRelayoutGuard() {
        if (typeof window.ResizeObserver !== 'function') return;
        var lastW = 0;
        var lastH = 0;
        var pending = false;
        function relayout() {
          if (pending) return;
          pending = true;
          requestAnimationFrame(function () {
            pending = false;
            var w = document.documentElement.clientWidth || 0;
            var h = document.documentElement.clientHeight || 0;
            if (w === 0 || h === 0) return;
            /* Skip noise — only relayout if size changed by more
               than 2px. Reveal's own debounce is 100ms; ours is
               per-frame. */
            if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
            lastW = w;
            lastH = h;
            try {
              if (typeof Reveal !== 'undefined' && typeof Reveal.layout === 'function') {
                Reveal.layout();
                Reveal.sync();
              }
            } catch (_) { /* swallow — non-fatal */ }
          });
        }
        try {
          var ro = new ResizeObserver(relayout);
          ro.observe(document.documentElement);
        } catch (_) { /* no-op if RO setup fails */ }
        document.addEventListener('visibilitychange', relayout);
        /* First-tick check in case the iframe is ALREADY visible by
           the time this script runs (most common path). */
        requestAnimationFrame(relayout);
      })();
      /* Suppress click on the slide-number anchor. With hash:false the
         href="#/h/v" fragment navigation no-ops but the click can bubble
         into reveal's pause-mode toggle, blacking out the slide window
         unexpectedly. Use capture-phase so we intercept before reveal's
         own handler. */
      document.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('.slide-number')) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);
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
      var SLIDES_NG_MM_DURATION = ${magicMoveDuration};
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
            entry.renderer.render(tokens, { duration: SLIDES_NG_MM_DURATION });
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
        var sceneEl = document.getElementById('slides-ng-scene');
        var activeSceneId = (sceneEl && sceneEl.classList.contains('on'))
          ? (sceneEl.getAttribute('data-scene-id') || null)
          : null;
        // v0.11.15: harvest per-slide panel-visibility override
        // (slides-ng-hide-panels frontmatter, emitted as
        // data-hide-panels on the section by slideToHtml).
        var hidePanelsAttr = current ? current.getAttribute('data-hide-panels') : null;
        var hidePanels = hidePanelsAttr
          ? hidePanelsAttr.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
          : [];
        return {
          type: 'slides-ng-state',
          currentIdx: indices.h,
          fragmentIdx: indices.f != null ? indices.f : -1,
          totalSlides: totalSlides,
          // isBlackout retained for backwards compatibility with the
          // pre-0.7 speaker view bridge consumers — derived from the
          // active scene id now.
          isBlackout: activeSceneId === 'blackout',
          activeSceneId: activeSceneId,
          notesHtml: notesEl ? notesEl.innerHTML : '',
          nextTitle: nextTitleEl ? nextTitleEl.innerText.trim().slice(0, 80) : '',
          slides: harvestSlideMeta(),
          hidePanels: hidePanels
        };
      }
      function postState() {
        var state = currentState();
        if (state && window.parent && window.parent !== window) {
          window.parent.postMessage(state, '*');
        }
      }

      // Thumbnail cache for the Grid overlay. Populated in idle time
      // after Reveal becomes ready so opening Grid is instant —
      // cloning each slide's .slides-ng-layout takes a few ms per
      // slide; doing it in advance avoids any perceived stutter on
      // big decks. Cache key = slide idx; value = a detached cloned
      // element we cloneNode() again when actually rendering a tile
      // (cached node can't be appended to multiple places, but it
      // can be cloned as many times as needed).
      var slidesNgThumbCache = null;
      function warmThumbnailCache() {
        if (slidesNgThumbCache) return;
        var sections = Array.from(
          document.querySelectorAll('.reveal > .slides > section')
        );
        // v0.11.13: clone the entire section element, not just its
        // inner slides-ng-layout child. Theme CSS is scoped to
        // .reveal section { ... } — cloning only the inner layout
        // placed it OUTSIDE any .reveal ancestor, so text-align,
        // font-size, color etc. all dropped out. Tiles looked
        // nothing like the actual preview. Cloning the section +
        // wrapping each tile in a fresh .reveal > .slides scope
        // restores theme fidelity.
        slidesNgThumbCache = sections.map(function (section) {
          return section.cloneNode(true);
        });
      }
      function scheduleThumbnailWarmup() {
        var run = function () { warmThumbnailCache(); };
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(run, { timeout: 2000 });
        } else {
          setTimeout(run, 100);
        }
      }
      function getCachedSlideClone(idx) {
        if (!slidesNgThumbCache) warmThumbnailCache();
        var cached = slidesNgThumbCache[idx];
        return cached ? cached.cloneNode(true) : null;
      }

      /*
       * v0.11.0: build a scrollable strip of slide thumbnails over
       * the whole iframe. Used by the speaker view's picker panel.
       * Replaces reveal's slide presentation in this iframe. Tile
       * clicks post slides-ng-picker events back up; parent forwards
       * as goto commands.
       *
       * orientation: 'vertical' (column) or 'horizontal' (row)
       * tileWidth: pixel width for tiles; 0 = auto-fit container
       */
      function buildPickerStrip(orientation, tileWidth, initialCurrentIdx) {
        var existing = document.getElementById('slides-ng-picker-strip');
        if (existing) existing.remove();
        var revealEl = document.querySelector('.reveal');
        if (revealEl) revealEl.style.display = 'none';
        var revealConfig2 = (typeof Reveal.getConfig === 'function' ? Reveal.getConfig() : {}) || {};
        var SLIDE_W2 = typeof revealConfig2.width === 'number' && revealConfig2.width > 0 ? revealConfig2.width : 960;
        var SLIDE_H2 = typeof revealConfig2.height === 'number' && revealConfig2.height > 0 ? revealConfig2.height : 700;
        var strip = document.createElement('div');
        strip.id = 'slides-ng-picker-strip';
        strip.setAttribute('data-orientation', orientation);
        strip.setAttribute('data-tile-width', String(tileWidth || 0));
        document.body.appendChild(strip);
        var meta = harvestSlideMeta();
        meta.forEach(function (s) {
          var tile = document.createElement('button');
          tile.setAttribute('type', 'button');
          tile.setAttribute('data-slide-idx', String(s.idx));
          tile.className = 'slides-ng-picker-tile';
          var thumb = document.createElement('div');
          thumb.className = 'slides-ng-picker-thumb';
          tile.appendChild(thumb);
          // v0.11.13: wrap the cloned section in a fresh
          // .reveal > .slides scope so theme CSS rules apply (see
          // matching change in the Grid overlay). The picker tile's
          // applyPickerStripLayout later sets the scale + dimensions
          // on this wrapper.
          var content = getCachedSlideClone(s.idx);
          if (content) {
            var picRevealScope = document.createElement('div');
            picRevealScope.className = 'reveal slides-ng-picker-thumb-content';
            var picSlidesScope = document.createElement('div');
            picSlidesScope.className = 'slides';
            picSlidesScope.style.cssText = 'width:100%;height:100%;';
            content.style.cssText =
              'position:relative;display:block;visibility:visible;opacity:1;' +
              'top:0;left:0;width:100%;height:100%;transform:none;';
            picSlidesScope.appendChild(content);
            picRevealScope.appendChild(picSlidesScope);
            thumb.appendChild(picRevealScope);
          }
          var num = document.createElement('div');
          num.className = 'slides-ng-picker-tile-num';
          num.textContent = String(s.idx + 1);
          tile.appendChild(num);
          // v0.11.1: title-overlay element removed. The slide's own
          // headings are already visible in the cloned thumbnail
          // content, so the overlay just duplicated information.
          // Keep s.title in the button's aria-label / title for
          // accessibility.
          if (s.title) {
            tile.setAttribute('aria-label', String(s.idx + 1) + ': ' + s.title);
            tile.title = s.title;
          } else {
            tile.setAttribute('aria-label', 'Slide ' + (s.idx + 1));
          }
          tile.addEventListener('click', function () {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage(
                { type: 'slides-ng-picker', event: 'click', idx: s.idx },
                '*'
              );
            }
          });
          strip.appendChild(tile);
        });
        // Store dimensions on the strip so layout helper can compute scale.
        strip.setAttribute('data-slide-w', String(SLIDE_W2));
        strip.setAttribute('data-slide-h', String(SLIDE_H2));
        applyPickerStripLayout(strip);
        // v0.11.2: highlight the current slide using the index the
        // parent passed in — Reveal.getIndices() inside the picker
        // iframe always returns 0 because we never navigate this
        // iframe (the bridge swaps it straight to picker-strip
        // mode at idx 0). Falls back to 0 if no idx provided.
        var idx0 = typeof initialCurrentIdx === 'number' ? initialCurrentIdx : 0;
        var current = strip.querySelector('button[data-slide-idx="' + idx0 + '"]');
        if (current) {
          current.classList.add('current');
          // Re-apply inline styles for the .current state since
          // applyPickerStripLayout already ran above.
          applyCurrentTileStyle(current);
        }
      }

      /**
       * Apply the inline accent styles for a tile marked .current,
       * AND tint its slide-number badge. Used both during
       * applyPickerStripLayout and during setPickerCurrent so the
       * styling stays consistent regardless of which path set
       * .current.
       */
      function applyCurrentTileStyle(tile) {
        tile.style.border = '2px solid var(--r-link-color, #42affa)';
        tile.style.boxShadow = '0 0 0 3px rgba(66, 175, 250, 0.32)';
        var num = tile.querySelector('.slides-ng-picker-tile-num');
        if (num) {
          num.style.background = 'var(--r-link-color, #42affa)';
          num.style.borderColor = '#fff';
        }
      }

      /**
       * Reset a tile to non-current styling. Used by setPickerCurrent
       * when shifting the current marker off an old tile.
       */
      function clearCurrentTileStyle(tile) {
        tile.style.border = '2px solid rgba(255,255,255,0.18)';
        tile.style.boxShadow = '';
        var num = tile.querySelector('.slides-ng-picker-tile-num');
        if (num) {
          num.style.background = 'rgba(0,0,0,0.78)';
          num.style.borderColor = 'rgba(255,255,255,0.55)';
        }
      }

      /**
       * Re-apply CSS based on the strip's current orientation. Called
       * on initial build and on every setPickerOrientation command.
       */
      function applyPickerStripLayout(strip) {
        var orientation = strip.getAttribute('data-orientation') || 'vertical-1';
        var tileWidthAttr = parseInt(strip.getAttribute('data-tile-width') || '0', 10);
        var slideW = parseInt(strip.getAttribute('data-slide-w') || '960', 10) || 960;
        var slideH = parseInt(strip.getAttribute('data-slide-h') || '700', 10) || 700;
        var aspect = slideH / slideW;
        var stripBodyBg = (window.getComputedStyle && getComputedStyle(document.body).backgroundColor) || '#000';
        // v0.11.15: legacy "vertical" → "vertical-1"
        if (orientation === 'vertical') orientation = 'vertical-1';

        var stripInnerW = strip.clientWidth - 16;
        var stripInnerH = strip.clientHeight - 16;

        // v0.11.15: "auto" picks based on container shape.
        // - wide enough for 2 horizontal slides → 'horizontal'
        // - wider than tall by 1.2x+ AND fits 2 tiles → 'vertical-2'
        // - otherwise → 'vertical-1'
        if (orientation === 'auto') {
          var preferTileW = tileWidthAttr > 0 ? tileWidthAttr : 200;
          var canFit2 = stripInnerW > preferTileW * 2 + 6;
          var wideEnoughForHorizontal = stripInnerW > stripInnerH * 1.8;
          orientation = wideEnoughForHorizontal
            ? 'horizontal'
            : (canFit2 ? 'vertical-2' : 'vertical-1');
        }

        // Base strip styles per orientation.
        var stripBase =
          'position:fixed;inset:0;background:#0a0a0a;color:#fff;' +
          'z-index:5;padding:8px;box-sizing:border-box;' +
          'font-family:var(--r-main-font, "Source Sans Pro", sans-serif);';
        if (orientation === 'horizontal') {
          strip.style.cssText = stripBase +
            'display:flex;gap:6px;align-items:center;' +
            'flex-direction:row;overflow-x:auto;overflow-y:hidden;';
        } else if (orientation === 'vertical-2') {
          // Two-column grid; rows auto-flow.
          strip.style.cssText = stripBase +
            'display:grid;grid-template-columns:1fr 1fr;gap:6px;' +
            'align-content:start;overflow-y:auto;overflow-x:hidden;';
        } else {
          // vertical-1 (default)
          strip.style.cssText = stripBase +
            'display:flex;gap:6px;align-items:center;' +
            'flex-direction:column;overflow-y:auto;overflow-x:hidden;';
        }

        // Tile dimensions per orientation.
        var tileW, tileH;
        if (orientation === 'horizontal') {
          tileH = stripInnerH > 0 ? stripInnerH - 8 : 80;
          tileW = Math.round(tileH / aspect);
          if (tileWidthAttr > 0) {
            tileW = tileWidthAttr;
            tileH = Math.round(tileW * aspect);
          }
        } else if (orientation === 'vertical-2') {
          // Each grid column is half the strip width (minus gap).
          var colW = Math.floor((stripInnerW - 6) / 2);
          tileW = tileWidthAttr > 0 ? Math.min(tileWidthAttr, colW) : colW;
          tileH = Math.round(tileW * aspect);
        } else {
          // vertical-1
          if (tileWidthAttr > 0) {
            tileW = tileWidthAttr;
          } else if (stripInnerW > 0) {
            tileW = Math.min(stripInnerW, 240);
          } else {
            tileW = 200;
          }
          tileH = Math.round(tileW * aspect);
        }
        var scale = tileW / slideW;
        var tiles = strip.querySelectorAll('.slides-ng-picker-tile');
        tiles.forEach(function (t) {
          t.style.cssText =
            'position:relative;width:' + tileW + 'px;height:' + tileH + 'px;' +
            'flex:0 0 auto;background:' + stripBodyBg + ';border:2px solid rgba(255,255,255,0.18);' +
            'border-radius:6px;padding:0;cursor:pointer;overflow:hidden;color:#fff;' +
            'font:inherit;';
          var thumb = t.querySelector('.slides-ng-picker-thumb');
          if (thumb) {
            thumb.style.cssText =
              'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
            var content = thumb.querySelector('.slides-ng-picker-thumb-content');
            if (content) {
              content.style.cssText =
                'position:absolute;top:0;left:0;' +
                'width:' + slideW + 'px;height:' + slideH + 'px;' +
                'transform:scale(' + scale + ');transform-origin:0 0;' +
                'pointer-events:none;';
            }
          }
          var num = t.querySelector('.slides-ng-picker-tile-num');
          if (num) {
            // v0.11.1: square badge with border, top-left corner.
            // Was: text-only with a translucent pill bg, bottom-right.
            num.style.cssText =
              'position:absolute;top:6px;left:6px;' +
              'width:24px;height:24px;box-sizing:border-box;' +
              'display:flex;align-items:center;justify-content:center;' +
              'background:rgba(0,0,0,0.78);' +
              'border:1.5px solid rgba(255,255,255,0.55);' +
              'color:#fff;border-radius:4px;' +
              'font-size:12px;font-weight:700;line-height:1;' +
              'pointer-events:none;z-index:3;' +
              'font-variant-numeric:tabular-nums;' +
              'text-shadow:0 1px 2px rgba(0,0,0,0.6);';
          }
          if (t.classList.contains('current')) {
            // v0.11.2: delegate to shared helper so setPickerCurrent
            // can apply the same styling without duplicated CSS.
            applyCurrentTileStyle(t);
          }
        });
      }

      // v0.11.13: when true (default), scenes inherit the theme's
      // body background + text color so they match the deck.
      var SCENE_INHERIT_THEME_BG = ${sceneInheritThemeBg};

      function ensureSceneEl() {
        var el = document.getElementById('slides-ng-scene');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'slides-ng-scene';
        // Default visuals — v0.11.13: read theme body bg + text color
        // when SCENE_INHERIT_THEME_BG is true. Falls back to the
        // v0.7-era hardcoded black overlay when false (override via
        // frontmatter or setting).
        var bg = '#000';
        var color = '#fff';
        if (SCENE_INHERIT_THEME_BG && window.getComputedStyle) {
          var cs = getComputedStyle(document.body);
          if (cs.backgroundColor) bg = cs.backgroundColor;
          if (cs.color) color = cs.color;
        }
        // Full-viewport overlay; flex-column so multiple block-level
        // markdown children (h1 + p, lists, etc.) stack VERTICALLY.
        el.style.cssText =
          'position:fixed;inset:0;background:' + bg + ';color:' + color + ';' +
          'z-index:9999;display:none;flex-direction:column;align-items:center;' +
          'justify-content:center;text-align:center;padding:5%;overflow:auto;' +
          'font-family:var(--r-main-font, "Source Sans Pro", sans-serif);' +
          'font-size:2em;line-height:1.4;gap:0.5em;';
        document.body.appendChild(el);
        return el;
      }
      function setScene(id, html) {
        var el = ensureSceneEl();
        el.setAttribute('data-scene-id', id || '');
        el.innerHTML = html || '';
        el.style.display = 'flex';
        el.classList.add('on');
        postState();
      }
      function clearScene() {
        var el = document.getElementById('slides-ng-scene');
        if (!el) return;
        el.classList.remove('on');
        el.style.display = 'none';
        el.setAttribute('data-scene-id', '');
        el.innerHTML = '';
        postState();
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
            case 'toggleOverview': {
              // Custom slides-picker overlay (v0.7.4+). Each tile contains
              // a CLONE of the actual slide's content (.slides-ng-layout)
              // scaled to fit via CSS transform. Outside reveal's
              // positioning system the transform works cleanly — no clip
              // escape, no horizontal overflow, no library dependency.
              // The clones inherit the theme + slides-ng CSS, so tiles
              // look like real miniatures of each slide.
              var existingOverlay = document.getElementById('slides-ng-grid');
              if (existingOverlay) {
                existingOverlay.remove();
                break;
              }
              var meta = harvestSlideMeta();
              var sections = Array.from(
                document.querySelectorAll('.reveal > .slides > section')
              );
              var overlay = document.createElement('div');
              overlay.id = 'slides-ng-grid';
              overlay.setAttribute('role', 'dialog');
              overlay.style.cssText =
                'position:fixed;inset:0;background:rgba(0,0,0,0.96);z-index:10000;' +
                'overflow-y:auto;overflow-x:hidden;padding:1.25rem;' +
                'font-family:var(--r-main-font, "Source Sans Pro", sans-serif);' +
                'color:#fff;cursor:default;';
              var header = document.createElement('div');
              header.style.cssText =
                'display:flex;justify-content:space-between;align-items:center;' +
                'margin-bottom:1rem;padding:0 0.5rem;';
              var title = document.createElement('div');
              title.textContent = 'All slides — click to jump';
              title.style.cssText = 'font-size:1.1em;font-weight:600;';
              var hint = document.createElement('div');
              hint.textContent = 'click outside or press Esc to close';
              hint.style.cssText = 'font-size:0.8em;opacity:0.6;';
              header.appendChild(title);
              header.appendChild(hint);
              overlay.appendChild(header);
              var grid = document.createElement('div');
              // Fixed-width tiles (220px) so the CSS transform's scale of
              // 220/960 ≈ 0.229 always exactly fills the tile. Larger
              // viewports just fit more tiles per row.
              grid.style.cssText =
                // v0.11.14: responsive — tiles fill the column,
                // column maxes at 320px but shrinks for narrow viewports.
                'display:grid;grid-template-columns:repeat(auto-fill, minmax(min(100%, 320px), 1fr));' +
                'justify-content:start;gap:0.85rem;';
              overlay.appendChild(grid);
              var currentIdx = (Reveal.getIndices() || {}).h || 0;
              // v0.10.1: read the actual slide dimensions from Reveal
              // instead of hardcoding 960 by 700. Decks with custom
              // width or height settings (or the v0.9.0 PDF aspect
              // override) used to produce mis-scaled thumbnails.
              var revealConfig = (typeof Reveal.getConfig === 'function' ? Reveal.getConfig() : {}) || {};
              var SLIDE_W = typeof revealConfig.width === 'number' && revealConfig.width > 0 ? revealConfig.width : 960;
              var SLIDE_H = typeof revealConfig.height === 'number' && revealConfig.height > 0 ? revealConfig.height : 700;
              // v0.11.12: read actual theme background color so non-
              // black themes (white, simple, beige etc.) render tiles
              // in the right color. Reveal applies theme to body bg.
              var bodyBg = (window.getComputedStyle && getComputedStyle(document.body).backgroundColor) || '#000';
              // v0.11.3: bumped from 220 to 320 so text inside the
              // cloned slide thumbnails is legible. Picker tiles
              // (up to 240px) had the same issue and that fix
              // (v0.11.0+) made them readable; Grid was still on
              // the 220px setting. Scale factor 320/960 ≈ 0.333.
              var TILE_W = 320;
              var THUMB_SCALE = TILE_W / SLIDE_W;
              meta.forEach(function (s) {
                // Prefer the pre-warmed clone (populated at idle time
                // after Reveal ready); fall back to a live clone if the
                // cache isn't warm yet.
                var sourceContent = getCachedSlideClone(s.idx);
                if (!sourceContent) {
                  var section = sections[s.idx];
                  sourceContent = section ? section.cloneNode(true) : null;
                }
                var isCurrent = s.idx === currentIdx;
                // v0.11.14: tile uses 100% of its grid column so the
                // grid's minmax(min(100%, 320px), 1fr) responsive
                // template actually shrinks. Height derives from
                // aspect ratio (16:9 → 56.25% padding-top trick).
                var tile = document.createElement('button');
                tile.style.cssText =
                  'position:relative;width:100%;aspect-ratio:' + SLIDE_W + '/' + SLIDE_H + ';' +
                  'background:' + bodyBg + ';border:2px solid ' +
                  (isCurrent ? 'var(--r-link-color, #42affa)' : 'rgba(255,255,255,0.18)') +
                  ';border-radius:6px;padding:0;cursor:pointer;' +
                  'overflow:hidden;font:inherit;color:#fff;' +
                  'transition:border-color 80ms ease, box-shadow 80ms ease;';
                tile.addEventListener('mouseenter', function () {
                  if (!isCurrent) tile.style.borderColor = 'rgba(255,255,255,0.4)';
                  tile.style.boxShadow = '0 0 0 3px rgba(66, 175, 250, 0.25)';
                });
                tile.addEventListener('mouseleave', function () {
                  if (!isCurrent) tile.style.borderColor = 'rgba(255,255,255,0.18)';
                  tile.style.boxShadow = '';
                });

                // v0.11.13: wrap the cloned section in a fresh
                // .reveal > .slides scope so theme CSS rules apply.
                // Previously we cloned only the inner layout, so the
                // section was outside any .reveal ancestor and theme
                // styles dropped out. Tiles are now faithful to the
                // actual preview rendering.
                if (sourceContent) {
                  var thumb = document.createElement('div');
                  thumb.style.cssText =
                    'position:absolute;top:0;left:0;width:100%;height:100%;' +
                    'overflow:hidden;pointer-events:none;';
                  var revealScope = document.createElement('div');
                  revealScope.className = 'reveal';
                  revealScope.style.cssText =
                    'position:absolute;top:0;left:0;' +
                    'width:' + SLIDE_W + 'px;height:' + SLIDE_H + 'px;' +
                    'transform:scale(' + THUMB_SCALE + ');transform-origin:0 0;' +
                    'pointer-events:none;';
                  var slidesScope = document.createElement('div');
                  slidesScope.className = 'slides';
                  slidesScope.style.cssText = 'width:100%;height:100%;';
                  // Reset section's own positioning/transform so it
                  // fills the slides scope at its natural place
                  // (reveal's runtime sets transform + position
                  // on the live section; we don't want those baked in).
                  sourceContent.style.cssText =
                    'position:relative;display:block;visibility:visible;opacity:1;' +
                    'top:0;left:0;width:100%;height:100%;transform:none;';
                  slidesScope.appendChild(sourceContent);
                  revealScope.appendChild(slidesScope);
                  thumb.appendChild(revealScope);
                  tile.appendChild(thumb);
                }

                // v0.11.12: square bordered badge in the top-left, same
                // visual as the picker thumbnails (v0.11.1+). Larger
                // and more legible than the old pill in the corner.
                var num = document.createElement('div');
                num.textContent = String(s.idx + 1);
                num.style.cssText =
                  'position:absolute;top:6px;left:6px;' +
                  'width:28px;height:28px;box-sizing:border-box;' +
                  'display:flex;align-items:center;justify-content:center;' +
                  'background:rgba(0,0,0,0.78);' +
                  'border:1.5px solid rgba(255,255,255,0.55);' +
                  'color:#fff;border-radius:4px;' +
                  'font-size:14px;font-weight:700;line-height:1;' +
                  'pointer-events:none;z-index:3;' +
                  'font-variant-numeric:tabular-nums;' +
                  'text-shadow:0 1px 2px rgba(0,0,0,0.6);';
                tile.appendChild(num);

                // v0.11.12: title-overlay removed (was duplicating the
                // slide's own h1 visible in the cloned thumbnail). Same
                // fix the picker thumbnails got in v0.11.1. Title is
                // kept on the tile attributes for accessibility.
                if (s.title) {
                  tile.setAttribute('aria-label', String(s.idx + 1) + ': ' + s.title);
                  tile.title = s.title;
                }

                tile.addEventListener('click', function () {
                  Reveal.slide(s.idx);
                  overlay.remove();
                });
                grid.appendChild(tile);
              });
              // Click outside any tile closes.
              overlay.addEventListener('click', function (e) {
                if (e.target === overlay || e.target === header || e.target === title || e.target === hint) {
                  overlay.remove();
                }
              });
              var escHandler = function (e) {
                if (e.key === 'Escape') {
                  overlay.remove();
                  document.removeEventListener('keydown', escHandler);
                }
              };
              document.addEventListener('keydown', escHandler);
              document.body.appendChild(overlay);

              // v0.11.14: after the grid is in the DOM, recompute the
              // thumbnail scale based on the actual tile width. Tiles
              // are responsive (grid template uses minmax(min(100%,
              // 320px), 1fr)), so on narrow viewports each tile may
              // be < 320px wide. Without this pass, the cloned slide
              // content stays at SLIDE_W * 320/SLIDE_W scale and
              // overflows the smaller tiles.
              requestAnimationFrame(function () {
                var firstTile = grid.querySelector('button');
                if (!firstTile) return;
                var actualW = firstTile.clientWidth;
                if (!(actualW > 0)) return;
                var actualScale = actualW / SLIDE_W;
                grid.querySelectorAll('.reveal').forEach(function (rs) {
                  rs.style.transform = 'scale(' + actualScale + ')';
                });
              });
              break;
            }
            case 'toggleMenu': {
              // v0.11.3: try DOM-button click FIRST (the strategy
              // that originally worked in v0.7.0-0.10.1), then fall
              // back to plugin-API calls. v0.10.2 tried Reveal.getPlugin
              // first because it's the "documented" path, but in
              // practice the menu plugin's .toggle() seemed to no-op
              // silently in some states. The .slide-menu-button click
              // is the most reliable trigger across plugin versions.
              try {
                var menuBtn = document.querySelector('.slide-menu-button');
                if (menuBtn) {
                  menuBtn.click();
                } else if (typeof Reveal.getPlugin === 'function') {
                  var menuPlugin = Reveal.getPlugin('menu');
                  if (menuPlugin) {
                    if (typeof menuPlugin.toggle === 'function') {
                      menuPlugin.toggle();
                    } else if (typeof menuPlugin.openMenu === 'function') {
                      if (menuPlugin.isOpen && menuPlugin.isOpen()) {
                        menuPlugin.closeMenu();
                      } else {
                        menuPlugin.openMenu();
                      }
                    }
                  }
                }
                // Diagnostic — visible in devtools if the user opens
                // Ctrl+Shift+I and clicks Menu. Helps figure out why
                // it might not be working on their setup.
                console.log('[slides-ng] toggleMenu fired', {
                  hadButton: !!menuBtn,
                  hasGetPlugin: typeof Reveal.getPlugin === 'function',
                  hasMenuPlugin: typeof Reveal.getPlugin === 'function'
                    ? !!Reveal.getPlugin('menu')
                    : false,
                });
              } catch (e) {
                console.warn('[slides-ng] toggleMenu error', e);
              }
              break;
            }
            case 'toggleBlackout': {
              // Backwards-compat alias: blackout is now scene id
              // "blackout" with empty content. If blackout is already
              // active, clear; otherwise activate.
              var existing = document.getElementById('slides-ng-scene');
              var activeNow = existing && existing.classList.contains('on')
                ? existing.getAttribute('data-scene-id')
                : null;
              if (activeNow === 'blackout') clearScene();
              else setScene('blackout', '');
              break;
            }
            case 'setScene':
              if (typeof data.id === 'string') {
                setScene(data.id, typeof data.html === 'string' ? data.html : '');
              }
              break;
            case 'clearScene':
              clearScene();
              break;
            case 'requestState': postState(); break;
            case 'enablePickerStrip': {
              // v0.11.0: turn this iframe into a strip of slide
              // thumbnails for the speaker view picker panel.
              // Hides reveal slide stage; tile clicks post
              // slides-ng-picker events back up.
              // v0.11.16 fix: accept the canonical orientation set
              // (vertical-1, vertical-2, horizontal, auto). Previously
              // this branch coerced anything non-horizontal to the
              // legacy 'vertical' value, which silently downgraded
              // every 2-col / auto request back to 1-col.
              try {
                var allowed = ['vertical-1', 'vertical-2', 'horizontal', 'auto', 'vertical'];
                var raw = (data && typeof data.orientation === 'string') ? data.orientation : '';
                var orient = (allowed.indexOf(raw) !== -1) ? raw : 'vertical-1';
                if (orient === 'vertical') orient = 'vertical-1';
                var tileWidth = (data && typeof data.tileWidth === 'number')
                  ? data.tileWidth : 0;
                var initialIdx = (data && typeof data.currentIdx === 'number')
                  ? data.currentIdx : 0;
                buildPickerStrip(orient, tileWidth, initialIdx);
              } catch (e) { console.warn('[slides-ng] enablePickerStrip', e); }
              break;
            }
            case 'setPickerOrientation': {
              // v0.11.16 fix: accept the canonical orientation set
              // (was: only 'horizontal' | 'vertical'). The runtime
              // cycle button posts vertical-1 / vertical-2 / horizontal
              // / auto — those used to be rejected silently.
              var stripEl = document.getElementById('slides-ng-picker-strip');
              var allowedSet = ['vertical-1', 'vertical-2', 'horizontal', 'auto', 'vertical'];
              var rawOrient = (data && typeof data.orientation === 'string') ? data.orientation : '';
              if (stripEl && allowedSet.indexOf(rawOrient) !== -1) {
                var canonOrient = (rawOrient === 'vertical') ? 'vertical-1' : rawOrient;
                stripEl.setAttribute('data-orientation', canonOrient);
                applyPickerStripLayout(stripEl);
              }
              break;
            }
            case 'setPickerCurrent': {
              var stripEl2 = document.getElementById('slides-ng-picker-strip');
              if (stripEl2 && data && typeof data.idx === 'number') {
                var tiles = stripEl2.querySelectorAll('button[data-slide-idx]');
                tiles.forEach(function (t) {
                  var tIdx = parseInt(t.getAttribute('data-slide-idx') || '0', 10);
                  if (tIdx === data.idx) {
                    t.classList.add('current');
                    applyCurrentTileStyle(t);
                    t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                  } else if (t.classList.contains('current')) {
                    t.classList.remove('current');
                    clearCurrentTileStyle(t);
                  }
                });
              }
              break;
            }
            case 'relayout': {
              // v0.10.4: parent posts this when the iframe element
              // resizes. The in-iframe ResizeObserver guard observes
              // document.documentElement, which doesn't reliably
              // resize in Electron when the outer iframe element
              // does — so the parent-side observer is the authoritative
              // signal that "the viewport is real now, recompute".
              try {
                if (typeof Reveal !== 'undefined' && typeof Reveal.layout === 'function') {
                  Reveal.layout();
                  if (typeof Reveal.sync === 'function') Reveal.sync();
                }
              } catch (_) { /* swallow */ }
              break;
            }
          }
        } catch (e) {
          console.warn('[slides-ng] postMessage command failed', e);
        }
      });

      // v0.11.14: bridge-ready postback. The parent (speaker view)
      // listens for this to know the iframe's message handler is
      // installed; on receipt it re-posts pending commands like
      // enablePickerStrip / setPickerCurrent. Defeats the race where
      // all 5 retries of the parent's burst could miss before the
      // listener attaches (causes picker iframe to stay in default
      // reveal-render mode instead of strip mode).
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            { type: 'slides-ng-bridge-ready' },
            '*'
          );
        }
      } catch (_) { /* parent unreachable; ignore */ }

      function attachListeners() {
        if (typeof Reveal === 'undefined') {
          setTimeout(attachListeners, 50);
          return;
        }
        Reveal.on('ready', function () {
          postState();
          // v0.10.4: Reveal initialised; recompute layout once now in
          // case the iframe was at 0x0 dimensions when init ran (the
          // ribbon-open-blank-pane bug). Cheap and idempotent — if
          // dimensions were correct, this is a no-op visually.
          try {
            if (typeof Reveal.layout === 'function') Reveal.layout();
          } catch (_) { /* swallow */ }
          // Pre-warm the Grid-overlay thumbnail cache in idle time so
          // the first Grid open is instant. Cloning N small DOM trees
          // off the main loop costs nothing while reveal is otherwise
          // idle, and saves a perceptible stutter on big decks.
          scheduleThumbnailWarmup();
        });
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

/**
 * Resolve the imageLayoutSplit setting → grid-template-columns for the
 * image-left layout (image on left, content on right). e.g. "60/40" =
 * 60% image, 40% content.
 */
function imageGridLeft(split: "50/50" | "60/40" | "40/60"): string {
  switch (split) {
    case "60/40":
      return "3fr 2fr";
    case "40/60":
      return "2fr 3fr";
    case "50/50":
    default:
      return "1fr 1fr";
  }
}

/** Mirrored split for image-right (content first, image second). */
function imageGridRight(split: "50/50" | "60/40" | "40/60"): string {
  switch (split) {
    case "60/40":
      return "2fr 3fr";
    case "40/60":
      return "3fr 2fr";
    case "50/50":
    default:
      return "1fr 1fr";
  }
}
