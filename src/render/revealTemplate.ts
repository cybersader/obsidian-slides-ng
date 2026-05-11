import { revealCss, revealJs, getTheme } from "./revealAssets";

export interface SlideHtml {
  /** Pre-rendered HTML for the slide body (markdown already converted). */
  body: string;
  /** Pre-rendered HTML for speaker notes, or undefined. */
  noteHtml?: string;
  /** Optional slide-level attributes to put on the `<section>` tag. */
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
</body>
</html>`;
}
