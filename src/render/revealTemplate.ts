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
  /**
   * v0.11.41: PowerPoint-style click-to-advance. When true, clicking
   * anywhere on a slide (outside links / inputs / controls) advances.
   */
  clickToProgress?: boolean;
  /**
   * v0.11.43: bake print-pdf mode into the exported HTML so it
   * doesn't depend on URL query parsing. Some browser/OS combinations
   * (and in particular Windows `electron.shell.openExternal` with
   * unusual path characters) seem to drop the `?print-pdf` query
   * before the file:// URL reaches the browser. When this flag is on,
   * the document forces `view: print` + adds the `print-pdf` and
   * (optionally) `show-notes` classes at script start — no URL flag
   * required.
   */
  forcePrintMode?: boolean;
  /** v0.11.43: when forcePrintMode is on, also reserve room for notes. */
  forceShowNotes?: boolean;
  /**
   * v0.11.44: bake pdfMaxPagesPerSlide into initOpts so reveal will
   * split overflowing slides across N pages. Defaults to 1
   * (no splitting; overflow is clipped).
   */
  forceMaxPagesPerSlide?: number;
  /**
   * v0.11.44: render the deck as a flowing document (sections become
   * headings, notes inline, no slide chrome) instead of as slide
   * cards. Useful for text-heavy decks where slides keep
   * overflowing — gives a more handout-like layout.
   */
  forcePrintDocument?: boolean;
  /**
   * v0.11.45: notes-emphasis layout. Slide shrinks to top ~35%,
   * notes get the bottom ~60% of the page. Engaged at PDF export
   * time when the user picks the "Slides (notes emphasis)" layout.
   */
  forceNotesEmphasis?: boolean;
  /** v0.11.46: auto-shrink slide content via JS-measured CSS scale. */
  forceAutoShrink?: boolean;
  /** v0.11.46: override @page paper size. */
  forcePageSize?: "a4" | "letter" | "legal";
  /** v0.11.46: override @page margin. */
  forcePageMargin?: "normal" | "narrow" | "wide" | "none";
  /** v0.11.46: grayscale via CSS filter. */
  forceGrayscale?: boolean;
  /** v0.11.46: drop per-slide backgrounds. */
  forceHideBackgrounds?: boolean;
  /** v0.11.46: stamp "Slide N / M" in the top-right of each page. */
  forceSlideNumberStamp?: boolean;
  /** v0.11.46: page header text (rendered above slide content). */
  forceHeaderText?: string;
  /** v0.11.46: page footer text. */
  forceFooterText?: string;
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
  /**
   * v0.11.36: pre-rendered scenes for the standalone speaker-view
   * popup. Each entry's `contentHtml` is the markdown rendered to
   * HTML at export time. Emitted as `window.__slidesNgScenes` in
   * the standalone HTML. Ignored in embedded mode.
   */
  scenes?: Array<{
    id: string;
    label: string;
    icon?: string;
    contentHtml: string;
  }>;
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
  const clickToProgress = options.clickToProgress ?? false;
  const forcePrintMode = options.forcePrintMode ?? false;
  const forceShowNotes = options.forceShowNotes ?? false;
  const forceMaxPagesPerSlide = options.forceMaxPagesPerSlide ?? 0;
  const forcePrintDocument = options.forcePrintDocument ?? false;
  const forceNotesEmphasis = options.forceNotesEmphasis ?? false;
  const forceAutoShrink = options.forceAutoShrink ?? false;
  const forcePageSize = options.forcePageSize ?? "";
  const forcePageMargin = options.forcePageMargin ?? "";
  const forceGrayscale = options.forceGrayscale ?? false;
  const forceHideBackgrounds = options.forceHideBackgrounds ?? false;
  const forceSlideNumberStamp = options.forceSlideNumberStamp ?? false;
  const forceHeaderText = options.forceHeaderText ?? "";
  const forceFooterText = options.forceFooterText ?? "";
  const PAGE_SIZE_MAP: Record<string, string> = {
    a4: "210mm 297mm",
    letter: "8.5in 11in",
    legal: "8.5in 14in",
  };
  const PAGE_MARGIN_MAP: Record<string, string> = {
    normal: "0.75in",
    narrow: "0.4in",
    wide: "1.25in",
    none: "0",
  };
  const pageSizeCss = forcePageSize ? PAGE_SIZE_MAP[forcePageSize] : "";
  const pageMarginCss = forcePageMargin ? PAGE_MARGIN_MAP[forcePageMargin] : "";
  // Escape header/footer text for safe HTML embedding.
  const escapeHtml = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const headerTextSafe = forceHeaderText ? escapeHtml(forceHeaderText) : "";
  const footerTextSafe = forceFooterText ? escapeHtml(forceFooterText) : "";
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
  const scenesJson = Array.isArray(options.scenes)
    ? JSON.stringify(options.scenes)
    : "[]";
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

  // v0.11.54: pre-bake the print-pdf marker classes onto the <html>
  // element so they're present in the initial HTML load — no JS
  // needed for CSS rules to match. The runtime script still adds
  // them too (idempotent classList.add) but the user-reported
  // "white empty slide card" PDF bug came from the browser print
  // preview snapshotting the DOM before our init script ran;
  // pre-baking guarantees the rules match from the first paint.
  const initialHtmlClasses = !embedded && forcePrintMode
    ? "print-pdf reveal-print"
      + (forceShowNotes ? " show-notes" : "")
      + (forceNotesEmphasis ? " notes-emphasis" : "")
      + (forceGrayscale ? " pdf-grayscale" : "")
      + (forceHideBackgrounds ? " pdf-hide-backgrounds" : "")
      + (forceSlideNumberStamp ? " pdf-slide-number-stamp" : "")
      + (forcePrintDocument ? " print-document" : "")
    : "";

  return `<!doctype html>
<html lang="en"${initialHtmlClasses ? ` class="${initialHtmlClasses}"` : ""}>
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
    /* v0.11.37: print-pdf mode — hide the standalone-export UI
     * chrome (hamburger, Grid button) when the user prints. They're
     * useful interactively but pollute the PDF output. */
    html.print-pdf .reveal .slide-menu-button,
    html.print-pdf #slides-ng-grid-btn,
    html.print-pdf .reveal .controls,
    html.print-pdf .reveal .progress {
      display: none !important;
    }
    /* v0.11.37: in print-pdf mode, force each slide section to be
     * a page-shaped card with its own page break. Reveal v5's
     * built-in print-pdf CSS already does this for its primary
     * elements, but we layer extra rules here for our custom
     * .slides-ng-layout content to make sure the layout is
     * preserved per-page. */
    html.print-pdf .reveal .slides {
      position: static !important;
      width: 100% !important;
      height: auto !important;
      display: block !important;
      overflow: visible !important;
      transform: none !important;
      left: 0 !important;
      top: 0 !important;
    }
    html.print-pdf .reveal .slides > section {
      position: relative !important;
      width: 100% !important;
      height: 100vh !important;
      min-height: 0;
      margin: 0 !important;
      padding: 4rem 3rem !important;
      box-sizing: border-box !important;
      overflow: hidden;
      display: block !important;
      opacity: 1 !important;
      visibility: visible !important;
      transform: none !important;
      page-break-after: always !important;
      page-break-inside: avoid !important;
      break-after: page !important;
      break-inside: avoid !important;
    }
    html.print-pdf .reveal .slides > section:last-of-type {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }
    html.print-pdf .reveal aside.notes {
      position: relative !important;
      display: block !important;
      visibility: visible !important;
      background: #f7f7f7;
      color: #333;
      padding: 1rem 1.5rem;
      margin-top: 1rem;
      border-top: 1px solid #ccc;
      font-size: 0.85em;
      page-break-inside: avoid !important;
    }
    /* When the print-pdf URL flag is set AND showNotes is on, notes
     * appear below the slide content (default reveal layout). */
    html.print-pdf.show-notes .reveal .slides > section {
      height: 70vh !important;
    }
    /* v0.11.50: notes-emphasis is now a "Notes Pages" handout
     * layout (matches PowerPoint Notes Pages view). Each slide page
     * has a slide visual sized like a real slide at the top, then
     * notes flow naturally below. If notes overflow, they wrap to
     * the next page. Engaged by the forcePrintMode + forceShowNotes
     * + forceNotesEmphasis combination. Overrides reveal's print
     * positioning so content can flow as a normal document. */
    html.print-pdf.notes-emphasis,
    html.print-pdf.notes-emphasis body {
      background: #fff !important;
      color: #222 !important;
      /* v0.11.52: force browsers to honor backgrounds even when
       * the print dialog\\'s "Background graphics" is unchecked
       * (Chrome default). Without this, the dark slide-card
       * background dropped silently and the white headings became
       * invisible on the white page. Both modern and webkit-
       * prefixed versions for browser compatibility. */
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html.print-pdf.notes-emphasis * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html.print-pdf.notes-emphasis .reveal {
      position: static !important;
      background: #fff !important;
      color: #222 !important;
    }
    html.print-pdf.notes-emphasis .reveal .slides {
      position: static !important;
      display: block !important;
      width: auto !important;
      height: auto !important;
      transform: none !important;
      left: 0 !important;
      top: 0 !important;
    }
    html.print-pdf.notes-emphasis .reveal .slides > section {
      position: static !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      padding: 0 !important;
      margin: 0 0 0.4in 0 !important;
      box-sizing: border-box !important;
      transform: none !important;
      background: #fff !important;
      color: #222 !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: auto !important;
      break-inside: auto !important;
    }
    html.print-pdf.notes-emphasis .reveal .slides > section:last-of-type {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }
    /* The "slide visual" — block at top of each page, sized like an
     * actual rendered slide. Explicit height + width so reveal print
     * stylesheet cannot collapse it. Hardcoded dark background +
     * light text so the card always looks like a slide even if CSS
     * variables do not resolve (v0.11.50 had aspect-ratio +
     * var(--r-background-color) and the user saw the slide card
     * render entirely INVISIBLE with the headings missing — root
     * cause was the variable not resolving in the cascade combined
     * with media:print CSS interactions). */
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout {
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      align-items: center !important;
      text-align: center !important;
      width: 100% !important;
      height: 4in !important;
      min-height: 4in !important;
      max-height: 4in !important;
      background: #191919 !important;
      background-color: #191919 !important;
      color: #ffffff !important;
      padding: 0.35in 0.5in !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      border: 1px solid #444 !important;
      border-radius: 4px !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      margin: 0 !important;
      gap: 0.2in !important;
      /* v0.11.52: force the browser to render the dark slide-card
       * background even when the user has Chrome\\'s "Background
       * graphics" print option turned off (it\\'s OFF by default,
       * which is why the v0.11.51 user-reported "white empty card,
       * no headings" PDF bug happened: bg dropped to white, color
       * stayed white = white-on-white, invisible). */
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    /* Headings inside the slide card — explicit light color so the
     * H1 doesn\\'t inherit the page-body dark color and disappear
     * against the dark slide card. */
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout h1,
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout h2,
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout h3,
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout h4,
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout h5,
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout h6 {
      color: #ffffff !important;
      margin: 0 !important;
      padding: 0 !important;
      line-height: 1.15 !important;
      text-shadow: none !important;
    }
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout h1 {
      font-size: 28pt !important;
      font-weight: 800 !important;
      letter-spacing: 0.02em !important;
    }
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout h2 {
      font-size: 22pt !important;
      font-weight: 700 !important;
    }
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout p,
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout li,
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout span,
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout strong,
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout em {
      color: #e8e8e8 !important;
      font-size: 14pt !important;
      line-height: 1.4 !important;
      margin: 0 !important;
    }
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout ul,
    html.print-pdf.notes-emphasis .reveal .slides > section > .slides-ng-layout ol {
      color: #e8e8e8 !important;
      text-align: left !important;
      margin: 0 !important;
      padding-left: 1.2em !important;
    }
    /* Notes flow naturally below the slide card, no fixed sizes.
     * Can overflow to the next page if too long. */
    html.print-pdf.notes-emphasis .reveal aside.notes {
      position: static !important;
      display: block !important;
      visibility: visible !important;
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      background: transparent !important;
      color: #222 !important;
      padding: 0.25in 0.1in 0.1in 0.1in !important;
      margin: 0.3in 0 0 0 !important;
      border-top: 1px solid #ccc !important;
      font-size: 11pt !important;
      line-height: 1.55 !important;
      font-style: normal !important;
      page-break-inside: auto !important;
      break-inside: auto !important;
    }
    html.print-pdf.notes-emphasis .reveal aside.notes::before {
      content: "Notes";
      display: block;
      font-size: 9pt;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 0.15in;
    }
    /* Hide reveal\\'s own .speaker-notes injection (still shown in
     * showNotes mode) — our aside.notes block already covers the
     * content. (v0.11.49 fix, retained.) */
    html.print-pdf.notes-emphasis .reveal .speaker-notes,
    html.print-pdf.notes-emphasis .speaker-notes {
      display: none !important;
    }
    /* Hide reveal print-mode UI clutter inside notes-emphasis. */
    html.print-pdf.notes-emphasis .reveal .controls,
    html.print-pdf.notes-emphasis .reveal .progress,
    html.print-pdf.notes-emphasis .reveal .slide-menu-button,
    html.print-pdf.notes-emphasis #slides-ng-grid-btn,
    html.print-pdf.notes-emphasis .reveal .backgrounds {
      display: none !important;
    }
    /* Notes-emphasis sets its own @page margin to leave room for the
     * card + notes layout. Overrides the user\\'s pageMargin pick
     * because the layout depends on knowing the printable area. */
    html.print-pdf.notes-emphasis {
      --slides-ng-notes-page-margin: 0.6in;
    }
    /* v0.11.69: hideBackgrounds override for the notes-emphasis slide
     * card. The card has hardcoded #191919 / #fff so hideBackgrounds
     * had no effect on it. Drop to white + dark text when on. */
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout {
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #222222 !important;
      border-color: #c0c0c0 !important;
    }
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout h1,
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout h2,
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout h3,
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout h4,
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout h5,
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout h6,
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout p,
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout li,
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout span,
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout strong,
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout em,
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout ul,
    html.print-pdf.notes-emphasis.pdf-hide-backgrounds .reveal .slides > section > .slides-ng-layout ol {
      color: #222222 !important;
    }

    /* v0.11.46: PDF experimentation knobs. Each rule is gated on
     * a class added by the forcePrintMode init branch, so off-by-
     * default; user opts in via the export modal. */
    html.pdf-grayscale body {
      filter: grayscale(1) !important;
    }
    html.pdf-hide-backgrounds .reveal .backgrounds,
    html.pdf-hide-backgrounds .reveal section[data-background],
    html.pdf-hide-backgrounds .reveal section[data-background-image],
    html.pdf-hide-backgrounds .reveal section[data-background-color] {
      background-color: #fff !important;
      background-image: none !important;
    }
    html.pdf-hide-backgrounds body {
      background: #fff !important;
    }
    /* Slide number stamp. JS sets data-slide-number on each section
     * (via Reveal slide indices) at render. Pseudo-element prints it
     * unobtrusively top-right.
     *
     * v0.11.56: in notes-emphasis mode, sections are position:static
     * so an absolutely-positioned ::before has nothing to anchor to.
     * Force the section to be position:relative for the stamp to
     * land in the right corner of the slide-card area. */
    html.pdf-slide-number-stamp .reveal .slides > section {
      position: relative !important;
    }
    html.pdf-slide-number-stamp .reveal .slides > section::before {
      content: "Slide " attr(data-slide-number) " / " attr(data-slide-total);
      position: absolute;
      top: 0.2in;
      right: 0.25in;
      font-size: 9pt;
      color: rgba(0, 0, 0, 0.65);
      background: rgba(255, 255, 255, 0.9);
      padding: 2px 8px;
      border-radius: 3px;
      border: 1px solid rgba(0, 0, 0, 0.15);
      font-family: var(--r-main-font, sans-serif);
      z-index: 5;
      pointer-events: none;
    }
    /* In notes-emphasis, position the stamp INSIDE the dark slide
     * card (top-right corner) so it's clearly part of the slide. */
    html.pdf-slide-number-stamp.notes-emphasis .reveal .slides > section::before {
      top: calc(0.35in + 4px);
      right: calc(0.5in + 6px);
      color: rgba(255, 255, 255, 0.85);
      background: rgba(0, 0, 0, 0.45);
      border-color: rgba(255, 255, 255, 0.18);
    }
    /* Page header + footer bands. Anchored to the top/bottom of each
     * slide section so they appear on every printed page. */
    html.print-pdf .slides-ng-page-header,
    html.print-pdf .slides-ng-page-footer {
      position: absolute;
      left: 0;
      right: 0;
      font-size: 0.7em;
      color: rgba(0, 0, 0, 0.65);
      background: rgba(255, 255, 255, 0.75);
      padding: 4px 1rem;
      font-family: var(--r-main-font, sans-serif);
      z-index: 4;
      pointer-events: none;
      text-align: center;
    }
    html.print-pdf .slides-ng-page-header { top: 0; border-bottom: 1px solid rgba(0,0,0,0.08); }
    html.print-pdf .slides-ng-page-footer { bottom: 0; border-top: 1px solid rgba(0,0,0,0.08); }
    ${pageSizeCss || pageMarginCss ? `@page {
      ${pageSizeCss ? `size: ${pageSizeCss};` : ""}
      ${pageMarginCss ? `margin: ${pageMarginCss};` : ""}
    }` : ""}

    /* v0.11.44/v0.11.65: document-layout mode for PDF export.
     * v0.11.65 rewrite per user feedback: page ITSELF adopts the
     * slide theme styling (dark bg, light text) — instead of
     * rendering content as plain black-on-white text. The PAGE
     * becomes the slide. Speaker notes are a separate light box
     * inside the dark page. Reveal\'s normal print-pdf section
     * positioning is overridden so content flows naturally. */
    html.print-document {
      background: var(--r-background-color, #191919) !important;
    }
    html.print-document body {
      background: var(--r-background-color, #191919) !important;
      color: var(--r-main-color, #ffffff) !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html.print-document * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html.print-document .reveal {
      position: static !important;
      background: var(--r-background-color, #191919) !important;
      color: var(--r-main-color, #ffffff) !important;
    }
    html.print-document .reveal .slides {
      position: static !important;
      display: block !important;
      width: auto !important;
      height: auto !important;
      transform: none !important;
      left: 0 !important;
      top: 0 !important;
    }
    /* v0.11.65: section = full page styled like a slide. Theme bg
     * + theme color. Generous padding so the content reads like
     * a single-slide handout. */
    html.print-document .reveal .slides > section {
      position: static !important;
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
      height: auto !important;
      min-height: 9in !important;
      max-height: none !important;
      padding: 0.8in 0.7in !important;
      margin: 0 !important;
      visibility: visible !important;
      opacity: 1 !important;
      transform: none !important;
      background: var(--r-background-color, #191919) !important;
      color: var(--r-main-color, #ffffff) !important;
      border: none !important;
      box-sizing: border-box !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: auto !important;
      break-inside: auto !important;
    }
    html.print-document .reveal .slides > section:last-of-type {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }
    /* Headings inherit theme; preserve uppercase if theme calls
     * for it (black theme does). */
    html.print-document .reveal .slides > section h1,
    html.print-document .reveal .slides > section h2,
    html.print-document .reveal .slides > section h3,
    html.print-document .reveal .slides > section h4,
    html.print-document .reveal .slides > section h5,
    html.print-document .reveal .slides > section h6 {
      color: var(--r-heading-color, var(--r-main-color, #ffffff)) !important;
    }
    html.print-document .reveal .slides > section p,
    html.print-document .reveal .slides > section li,
    html.print-document .reveal .slides > section td,
    html.print-document .reveal .slides > section span {
      color: var(--r-main-color, #ffffff) !important;
    }
    /* Notes block: a separate styled box at the bottom of each
     * page. Lighter-tinted to contrast with the dark page bg. */
    html.print-document .reveal aside.notes {
      position: static !important;
      display: block !important;
      visibility: visible !important;
      background: rgba(255, 255, 255, 0.95) !important;
      color: #222 !important;
      padding: 0.4in 0.5in !important;
      margin-top: 0.4in !important;
      border: 1px solid rgba(0, 0, 0, 0.18) !important;
      border-radius: 6px !important;
      font-size: 11pt !important;
      font-style: normal !important;
      line-height: 1.55 !important;
      page-break-inside: auto !important;
    }
    html.print-document .reveal aside.notes::before {
      content: "Notes";
      display: block;
      font-size: 9pt;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 0.15in;
    }
    html.print-document #slides-ng-grid-btn,
    html.print-document .reveal .slide-menu-button,
    html.print-document .reveal .controls,
    html.print-document .reveal .progress,
    html.print-document .reveal .backgrounds {
      display: none !important;
    }
    html.print-document .reveal section[data-background-color],
    html.print-document .reveal section[data-background],
    html.print-document .reveal section[data-background-image] {
      background-color: #fff !important;
      background-image: none !important;
    }
    /* v0.11.69: hideBackgrounds override for print-document. The
     * theme-bg + theme-color rules above bake in the dark slide
     * styling; hideBackgrounds must drop the page to white and
     * recolor headings/body to dark for legibility. */
    html.print-document.pdf-hide-backgrounds,
    html.print-document.pdf-hide-backgrounds body,
    html.print-document.pdf-hide-backgrounds .reveal,
    html.print-document.pdf-hide-backgrounds .reveal .slides > section {
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #222222 !important;
    }
    html.print-document.pdf-hide-backgrounds .reveal .slides > section h1,
    html.print-document.pdf-hide-backgrounds .reveal .slides > section h2,
    html.print-document.pdf-hide-backgrounds .reveal .slides > section h3,
    html.print-document.pdf-hide-backgrounds .reveal .slides > section h4,
    html.print-document.pdf-hide-backgrounds .reveal .slides > section h5,
    html.print-document.pdf-hide-backgrounds .reveal .slides > section h6,
    html.print-document.pdf-hide-backgrounds .reveal .slides > section p,
    html.print-document.pdf-hide-backgrounds .reveal .slides > section li,
    html.print-document.pdf-hide-backgrounds .reveal .slides > section td,
    html.print-document.pdf-hide-backgrounds .reveal .slides > section span {
      color: #222222 !important;
    }
    /* The "Notes" sidebox is already light/dark contrasted; keep it
     * but tone the bg down so it doesn\\'t look like a white card on
     * white page. Border + subtle bg-tint. */
    html.print-document.pdf-hide-backgrounds .reveal aside.notes {
      background: #f5f5f5 !important;
      color: #222 !important;
      border: 1px solid #ccc !important;
    }
    /* v0.11.34: hamburger button contrast. The default reveal-menu
     * button is too transparent and disappears against light slide
     * backgrounds (user-reported). Give it a solid translucent
     * backdrop + a soft border so it stays visible regardless of
     * slide bg. Hover boosts the bg to full opacity. */
    .reveal .slide-menu-button {
      background: rgba(0, 0, 0, 0.55) !important;
      border: 1px solid rgba(255, 255, 255, 0.25) !important;
      border-radius: 6px !important;
      padding: 6px 8px !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4) !important;
      transition: background 80ms ease, opacity 80ms ease !important;
      opacity: 0.85 !important;
    }
    .reveal .slide-menu-button:hover {
      background: rgba(0, 0, 0, 0.85) !important;
      opacity: 1 !important;
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
    /* v0.11.39: capture any unhandled error before Reveal.initialize
     * and surface it visibly. The user-reported "black screen" in
     * v0.11.37 suggested an async error was being swallowed — this
     * makes any such error impossible to miss. The handler also
     * postMessages the error to the parent window so the speaker
     * view can log it (and the plugin's debug.log feature in
     * embedded mode can persist it for sharing). */
    (function () {
      function reportError(label, err) {
        try {
          var info = {
            type: 'slides-ng-iframe-error',
            label: label,
            message: err && err.message ? err.message : String(err),
            stack: err && err.stack ? String(err.stack) : null,
            time: Date.now(),
          };
          if (window.parent && window.parent !== window) {
            window.parent.postMessage(info, '*');
          }
        } catch (_) {}
        try {
          if (document && document.body) {
            var existing = document.getElementById('slides-ng-iframe-error');
            if (existing) existing.remove();
            var pre = document.createElement('pre');
            pre.id = 'slides-ng-iframe-error';
            pre.style.cssText = 'position:fixed;top:0;left:0;right:0;' +
              'background:#220000;color:#ffb0b0;font-family:monospace;' +
              'font-size:12px;padding:0.6rem 1rem;margin:0;z-index:99999;' +
              'white-space:pre-wrap;border-bottom:2px solid #ff4040;';
            pre.textContent = 'slides-ng [' + label + ']: ' +
              (err && err.message ? err.message : String(err)) +
              (err && err.stack ? '\\n\\n' + err.stack : '');
            document.body.appendChild(pre);
          }
        } catch (_) {}
      }
      window.addEventListener('error', function (e) {
        reportError('uncaught', e.error || e.message);
      });
      window.addEventListener('unhandledrejection', function (e) {
        reportError('unhandled-promise', e.reason);
      });
      try {
        var initOpts = ${initConfig};
        ${!embedded && forcePrintMode ? `/* v0.11.43: forcePrintMode
         * BAKED INTO THE EXPORTED HTML. The previous flow relied on
         * a \`?print-pdf\` URL query, which depends on every layer
         * (path encoding, electron.shell.openExternal, Windows shell,
         * browser URL handler) preserving the query string. Repeated
         * user reports of "PDF export still looks the same" pointed
         * at one of those layers stripping or mis-decoding the query.
         * Baking the flag into the document removes that whole class
         * of failures — the file is intrinsically a PDF artifact. */
        initOpts.view = 'print';
        try {
          document.documentElement.classList.add('print-pdf');
          document.documentElement.classList.add('reveal-print');
          ${forceShowNotes ? `document.documentElement.classList.add('show-notes');
          initOpts.showNotes = true;` : ""}
          ${forcePrintDocument ? `/* v0.11.44: document-layout mode —
           * adds .print-document marker so CSS flattens sections into
           * a flowing document instead of slide cards. */
          document.documentElement.classList.add('print-document');` : ""}
          ${forceNotesEmphasis ? `/* v0.11.45: notes-emphasis mode —
           * adds .notes-emphasis class. CSS shrinks the slide block
           * to the top ~35vh and gives the notes the bottom ~60vh.
           * Implies showNotes (caller already set forceShowNotes). */
          document.documentElement.classList.add('notes-emphasis');` : ""}
          ${forceGrayscale ? `document.documentElement.classList.add('pdf-grayscale');` : ""}
          ${forceHideBackgrounds ? `document.documentElement.classList.add('pdf-hide-backgrounds');` : ""}
          ${forceSlideNumberStamp ? `document.documentElement.classList.add('pdf-slide-number-stamp');` : ""}
        } catch (_) {}
        ${forceMaxPagesPerSlide > 0 ? `/* v0.11.44: bake pdfMaxPagesPerSlide
         * directly into initOpts so reveal splits overflowing slides
         * across multiple pages. Was URL-only — same query-string-
         * stripping concern as forcePrintMode. */
        initOpts.pdfMaxPagesPerSlide = ${forceMaxPagesPerSlide};` : ""}
        ` : ""}${!embedded ? `/* v0.11.35/v0.11.37/v0.11.38: print-pdf
         * detection is now STRICTLY gated to standalone mode at
         * render time. Embedded preview never sees this branch
         * because the !embedded interpolation gate strips it from
         * the template — so any future bug in the print-pdf
         * detection cannot regress embedded preview rendering
         * (the v0.11.37 user-reported "embedded preview goes
         * black" regression motivated this defensive gating). */
        if (typeof location !== 'undefined' && /print-pdf/i.test(location.search)) {
          initOpts.view = 'print';
          try {
            document.documentElement.classList.add('print-pdf');
            document.documentElement.classList.add('reveal-print');
          } catch (_) {}
          /* v0.11.42: diagnostic — if print mode somehow fails to
           * activate within 3s, show a fixed banner explaining the
           * state. Helps remote-diagnose user-reported "PDF export
           * still looks the same" when we can\\'t see the screen. */
          setTimeout(function () {
            try {
              if (!document.documentElement.classList.contains('print-pdf')) {
                var banner = document.createElement('div');
                banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#c33;color:#fff;padding:8px 12px;z-index:99999;font-family:monospace;font-size:12px;';
                banner.textContent = '[slides-ng v0.11.42] Print mode failed to activate. URL search: ' + location.search + ' — please screenshot.';
                document.body.appendChild(banner);
              }
            } catch (_) {}
          }, 3000);
          var notesMatch = location.search.match(/[?&]showNotes(?:=([^&]+))?/i);
          if (notesMatch) {
            initOpts.showNotes = notesMatch[1] && notesMatch[1] !== 'true'
              ? decodeURIComponent(notesMatch[1])
              : true;
            /* v0.11.42: also flag the html element so our per-slide
             * notes CSS rule (html.print-pdf.show-notes ...) matches.
             * Without this, the section height stayed at 100vh and
             * notes overflowed onto the next page — which is why the
             * user reported "speaker notes only on the last slide":
             * notes WERE rendered, just pushed off-page. */
            try { document.documentElement.classList.add('show-notes'); } catch (_) {}
          }
        }` : ""}
        ${showMenu ? `if (typeof RevealMenu !== 'undefined') {
          initOpts.plugins = (initOpts.plugins || []).concat([RevealMenu]);
        }` : ""}
        /* v0.11.48: bootstrap heartbeat. Post to parent IMMEDIATELY
         * so the parent knows iframe scripts at least started running.
         * Catches the "Obsidian iframe scripts aren\\'t executing"
         * failure mode where the watchdog itself never fires. */
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({
              type: 'slides-ng-iframe-bootstrap',
              time: Date.now(),
              hasReveal: typeof Reveal !== 'undefined',
              sandbox: (typeof document.featurePolicy !== 'undefined') ? 'with-policy' : 'no-policy',
            }, '*');
          }
        } catch (_) {}
        var revealInit = Reveal.initialize(initOpts);
        /* v0.11.47/v0.11.48: black-screen watchdog with stronger
         * post-init visibility check. The previous v0.11.47 watchdog
         * only checked whether ready fired — but reveal can fire
         * ready successfully while still failing to activate any
         * slide (every section stays display:none, the user sees
         * a black pane). v0.11.48 also checks slide visibility at
         * the 5s mark AND attempts to force-activate slide 0 as a
         * last-resort self-heal. */
        (function () {
          var readyFired = false;
          function markReady() { readyFired = true; }
          try {
            if (revealInit && typeof revealInit.then === 'function') {
              revealInit.then(markReady, function (err) {
                reportError('reveal-init-rejected', err || new Error('reveal.initialize promise rejected'));
              });
            }
            if (typeof Reveal !== 'undefined' && typeof Reveal.on === 'function') {
              Reveal.on('ready', function () {
                markReady();
                try {
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'slides-ng-iframe-reveal-ready', time: Date.now() }, '*');
                  }
                } catch (_) {}
              });
            }
          } catch (_) {}
          setTimeout(function () {
            try {
              var sections = document.querySelectorAll('.reveal .slides > section');
              var slidesCount = sections.length;
              var presentCount = document.querySelectorAll('.reveal .slides > section.present').length;
              var viewportEl = document.querySelector('.reveal-viewport');
              var viewportSize = viewportEl
                ? viewportEl.clientWidth + 'x' + viewportEl.clientHeight
                : 'no-viewport';
              var docSize = document.documentElement.clientWidth + 'x' + document.documentElement.clientHeight;
              var firstSecComputed = sections[0] ? getComputedStyle(sections[0]) : null;
              var firstSecDisplay = firstSecComputed ? firstSecComputed.display : 'no-section';
              /* Always post a state snapshot so the parent can log
               * the iframe state at 5s — even when everything looks
               * healthy. Lets us correlate "user sees black" reports
               * with actual DOM state. */
              try {
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage({
                    type: 'slides-ng-iframe-watchdog',
                    time: Date.now(),
                    readyFired: readyFired,
                    slidesCount: slidesCount,
                    presentCount: presentCount,
                    viewportSize: viewportSize,
                    docSize: docSize,
                    firstSectionDisplay: firstSecDisplay,
                  }, '*');
                }
              } catch (_) {}
              /* Failure mode A: reveal never fired ready. */
              if (!readyFired) {
                reportError('reveal-init-timeout', new Error(
                  'Reveal.initialize did not emit ready within 5s. ' +
                  'slidesInDom=' + slidesCount + ' viewport=' + viewportSize
                ));
              }
              /* Failure mode B (NEW in v0.11.48): reveal fired ready
               * but no slide is .present, so the deck looks black. */
              else if (slidesCount > 0 && presentCount === 0) {
                reportError('no-slide-present', new Error(
                  'Reveal fired ready but no section has .present class. ' +
                  'slidesInDom=' + slidesCount +
                  ' firstSectionDisplay=' + firstSecDisplay +
                  ' viewport=' + viewportSize
                ));
                /* Self-heal: explicitly navigate to slide 0. */
                try { if (typeof Reveal.slide === 'function') Reveal.slide(0); } catch (_) {}
              }
              /* Banner only when something is actually wrong. */
              if (!readyFired || (slidesCount > 0 && presentCount === 0)) {
                var banner = document.createElement('div');
                banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#a30;color:#fff;padding:8px 12px;z-index:99999;font-family:monospace;font-size:11px;line-height:1.4;';
                banner.textContent = '[slides-ng v0.11.48] black-screen watchdog — ready=' + readyFired + ' slides=' + slidesCount + ' present=' + presentCount + ' viewport=' + viewportSize + ' display=' + firstSecDisplay;
                document.body.appendChild(banner);
              }
            } catch (_) {}
          }, 5000);
        })();
        ${!embedded && forceNotesEmphasis ? `
        /* v0.11.55: NUCLEAR option for the notes-emphasis slide-card.
         * Pure CSS kept failing across versions (variable resolution,
         * @media print interactions, browser print-snapshot timing).
         * Instead: walk every .slides-ng-layout and apply inline
         * styles directly to the element. Inline styles beat ANY CSS
         * rule, !important or not. Run on DOMContentLoaded so it
         * fires before reveal\\'s print plugin has a chance to do
         * anything funky. */
        function applyNotesEmphasisInline() {
          try {
            /* v0.11.69: hideBackgrounds opts out of the dark slide-card
             * theme. Use white card + dark text instead. */
            var hideBg = document.documentElement.classList.contains('pdf-hide-backgrounds');
            var cardBg = hideBg ? '#ffffff' : '#191919';
            var cardColor = hideBg ? '#222222' : '#ffffff';
            var headColor = hideBg ? '#222222' : '#ffffff';
            var bodyColor = hideBg ? '#444444' : '#e8e8e8';
            var borderCol = hideBg ? '#c0c0c0' : '#444';
            var layouts = document.querySelectorAll('.slides-ng-layout');
            for (var li = 0; li < layouts.length; li++) {
              var el = layouts[li];
              el.style.setProperty('display', 'flex', 'important');
              el.style.setProperty('flex-direction', 'column', 'important');
              el.style.setProperty('justify-content', 'center', 'important');
              el.style.setProperty('align-items', 'center', 'important');
              el.style.setProperty('text-align', 'center', 'important');
              el.style.setProperty('width', '100%', 'important');
              el.style.setProperty('height', '4in', 'important');
              el.style.setProperty('min-height', '4in', 'important');
              el.style.setProperty('max-height', '4in', 'important');
              el.style.setProperty('background', cardBg, 'important');
              el.style.setProperty('background-color', cardBg, 'important');
              el.style.setProperty('color', cardColor, 'important');
              el.style.setProperty('padding', '0.35in 0.5in', 'important');
              el.style.setProperty('box-sizing', 'border-box', 'important');
              el.style.setProperty('overflow', 'hidden', 'important');
              el.style.setProperty('border', '1px solid ' + borderCol, 'important');
              el.style.setProperty('border-radius', '4px', 'important');
              el.style.setProperty('margin', '0 0 0.3in 0', 'important');
              el.style.setProperty('-webkit-print-color-adjust', 'exact', 'important');
              el.style.setProperty('print-color-adjust', 'exact', 'important');
              /* Force every heading inside to theme-card-color + larger size. */
              var heads = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
              for (var hi = 0; hi < heads.length; hi++) {
                heads[hi].style.setProperty('color', headColor, 'important');
                heads[hi].style.setProperty('margin', '0', 'important');
                heads[hi].style.setProperty('padding', '0', 'important');
                heads[hi].style.setProperty('text-shadow', 'none', 'important');
                heads[hi].style.setProperty('line-height', '1.15', 'important');
                if (heads[hi].tagName === 'H1') {
                  heads[hi].style.setProperty('font-size', '28pt', 'important');
                  heads[hi].style.setProperty('font-weight', '800', 'important');
                } else if (heads[hi].tagName === 'H2') {
                  heads[hi].style.setProperty('font-size', '22pt', 'important');
                  heads[hi].style.setProperty('font-weight', '700', 'important');
                }
              }
              var paras = el.querySelectorAll('p, li, span, strong, em');
              for (var pi = 0; pi < paras.length; pi++) {
                paras[pi].style.setProperty('color', bodyColor, 'important');
                paras[pi].style.setProperty('font-size', '14pt', 'important');
                paras[pi].style.setProperty('line-height', '1.4', 'important');
                paras[pi].style.setProperty('margin', '0', 'important');
              }
              /* The parent <section> must let our card shape through.
               * v0.11.56: position:relative (not static) so a
               * pseudo-element like the slide-number-stamp ::before
               * has the section as its containing block. */
              var parent = el.parentElement;
              if (parent && parent.tagName === 'SECTION') {
                parent.style.setProperty('position', 'relative', 'important');
                parent.style.setProperty('display', 'block', 'important');
                parent.style.setProperty('width', '100%', 'important');
                parent.style.setProperty('height', 'auto', 'important');
                parent.style.setProperty('min-height', '0', 'important');
                parent.style.setProperty('max-height', 'none', 'important');
                parent.style.setProperty('padding', '0', 'important');
                parent.style.setProperty('margin', '0 0 0.4in 0', 'important');
                parent.style.setProperty('transform', 'none', 'important');
                parent.style.setProperty('opacity', '1', 'important');
                parent.style.setProperty('visibility', 'visible', 'important');
                parent.style.setProperty('page-break-after', 'always', 'important');
                parent.style.setProperty('break-after', 'page', 'important');
                parent.style.setProperty('background', '#ffffff', 'important');
              }
              /* The sibling <aside class=notes> — make it flow. */
              if (parent) {
                var aside = parent.querySelector('aside.notes');
                if (aside) {
                  aside.style.setProperty('position', 'static', 'important');
                  aside.style.setProperty('display', 'block', 'important');
                  aside.style.setProperty('visibility', 'visible', 'important');
                  aside.style.setProperty('width', '100%', 'important');
                  aside.style.setProperty('height', 'auto', 'important');
                  aside.style.setProperty('min-height', '0', 'important');
                  aside.style.setProperty('max-height', 'none', 'important');
                  aside.style.setProperty('background', 'transparent', 'important');
                  aside.style.setProperty('color', '#222', 'important');
                  aside.style.setProperty('padding', '0.25in 0.1in', 'important');
                  aside.style.setProperty('margin', '0.3in 0 0 0', 'important');
                  aside.style.setProperty('border-top', '1px solid #ccc', 'important');
                  aside.style.setProperty('font-size', '11pt', 'important');
                  aside.style.setProperty('line-height', '1.55', 'important');
                  aside.style.setProperty('page-break-inside', 'auto', 'important');
                  aside.style.setProperty('break-inside', 'auto', 'important');
                }
              }
            }
            /* Also escape reveal\\'s absolute slides positioning. */
            var slidesEl = document.querySelector('.reveal .slides');
            if (slidesEl) {
              slidesEl.style.setProperty('position', 'static', 'important');
              slidesEl.style.setProperty('display', 'block', 'important');
              slidesEl.style.setProperty('width', '100%', 'important');
              slidesEl.style.setProperty('height', 'auto', 'important');
              slidesEl.style.setProperty('transform', 'none', 'important');
              slidesEl.style.setProperty('left', '0', 'important');
              slidesEl.style.setProperty('top', '0', 'important');
            }
            var revealEl = document.querySelector('.reveal');
            if (revealEl) {
              revealEl.style.setProperty('position', 'static', 'important');
              revealEl.style.setProperty('background', '#ffffff', 'important');
            }
            document.body.style.setProperty('background', '#ffffff', 'important');
          } catch (err) { console.warn('[slides-ng] notes-emphasis inline failed', err); }
        }
        /* Run immediately AND after reveal init, in case reveal mutates
         * the DOM during its init. */
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', applyNotesEmphasisInline);
        } else {
          applyNotesEmphasisInline();
        }
        if (revealInit && typeof revealInit.then === 'function') {
          revealInit.then(function () { setTimeout(applyNotesEmphasisInline, 100); });
        }
        setTimeout(applyNotesEmphasisInline, 800);
        ` : ""}
        ${!embedded && (forceAutoShrink || forceSlideNumberStamp || forceHeaderText || forceFooterText) ? `
        /* v0.11.46: post-init PDF tweaks. Hook into Reveal\\'s 'ready'
         * so slide DOM exists. Cheap — only runs in standalone-export
         * mode and only if the user picked one of these options. */
        function pdfPostInit() {
          try {
            var sections = document.querySelectorAll('.reveal .slides > section');
            ${forceSlideNumberStamp ? `var total = sections.length;
            for (var si = 0; si < sections.length; si++) {
              sections[si].setAttribute('data-slide-number', String(si + 1));
              sections[si].setAttribute('data-slide-total', String(total));
              /* v0.11.65: inject a REAL DOM element for the slide-
               * number stamp. The ::before pseudo-element approach
               * was too fragile (depended on position-relative
               * ancestors that v0.11.55 inline-styles sometimes
               * overrode; on a #ffffff section the dark stamp blended
               * with its own slide-card backdrop). A real positioned
               * element with inline-styles is foolproof. */
              if (!sections[si].querySelector('.slides-ng-slide-number-badge')) {
                var badge = document.createElement('div');
                badge.className = 'slides-ng-slide-number-badge';
                badge.textContent = 'Slide ' + (si + 1) + ' / ' + total;
                badge.style.cssText =
                  'position:absolute;top:0.25in;right:0.4in;z-index:50;' +
                  'font-size:9pt;padding:3px 8px;border-radius:3px;' +
                  'background:rgba(255,255,255,0.92);color:#222;' +
                  'border:1px solid rgba(0,0,0,0.18);' +
                  'font-family:var(--r-main-font, sans-serif);' +
                  'pointer-events:none;' +
                  '-webkit-print-color-adjust:exact;print-color-adjust:exact;';
                /* Ensure the section can anchor a position:absolute child. */
                if (getComputedStyle(sections[si]).position === 'static') {
                  sections[si].style.setProperty('position', 'relative', 'important');
                }
                sections[si].appendChild(badge);
              }
            }` : ""}
            ${forceHeaderText || forceFooterText ? `for (var hi = 0; hi < sections.length; hi++) {
              ${forceHeaderText ? `var h = document.createElement('div');
              h.className = 'slides-ng-page-header';
              h.textContent = ${JSON.stringify(forceHeaderText)};
              sections[hi].insertBefore(h, sections[hi].firstChild);` : ""}
              ${forceFooterText ? `var f = document.createElement('div');
              f.className = 'slides-ng-page-footer';
              f.textContent = ${JSON.stringify(forceFooterText)};
              sections[hi].appendChild(f);` : ""}
            }` : ""}
            ${forceAutoShrink ? `/* Auto-shrink: measure each section\\'s
             * natural content height (a wrapper-div inside the section
             * holds the original content) and apply a CSS scale so
             * everything fits within the slide-card height. Only
             * scales DOWN; never up — content smaller than the slide
             * stays at its natural size. */
            for (var ai = 0; ai < sections.length; ai++) {
              var sec = sections[ai];
              var maxH = sec.clientHeight;
              var natH = sec.scrollHeight;
              if (natH > maxH && natH > 0) {
                var factor = (maxH / natH) * 0.97;
                sec.style.transformOrigin = 'top left';
                /* Apply scale to a wrapper to avoid clipping by reveal\\'s
                 * own transform on the section. */
                sec.style.fontSize = (factor * 100) + '%';
              }
            }` : ""}
          } catch (err) { console.warn('[slides-ng] pdfPostInit error', err); }
        }
        if (revealInit && typeof revealInit.then === 'function') {
          revealInit.then(function () { setTimeout(pdfPostInit, 50); });
        } else if (typeof Reveal.on === 'function') {
          Reveal.on('ready', function () { setTimeout(pdfPostInit, 50); });
        } else {
          setTimeout(pdfPostInit, 500);
        }
        ` : ""}
        ${!embedded && forcePrintMode ? `/* v0.11.53: auto-open the
         * browser print dialog ~1.2s after Reveal init resolves, so
         * the user doesn\\'t have to hit Ctrl+P manually on the
         * opened export file. The delay lets reveal finish DOM
         * layout AND our pdfPostInit/notes-emphasis CSS settle
         * before window.print() takes its snapshot.
         *
         * v0.11.63: suppress auto-print when ?slidesNgNoAutoPrint=1
         * is in the URL — used by the test-pdf-matrix dev tool so
         * headless screenshots don\\'t collide with the print call. */
        function autoOpenPrintDialog() {
          try {
            if (/slidesNgNoAutoPrint/i.test(location.search)) return;
            window.print();
          } catch (_) {}
        }
        if (revealInit && typeof revealInit.then === 'function') {
          revealInit.then(function () { setTimeout(autoOpenPrintDialog, 1200); });
        } else {
          setTimeout(autoOpenPrintDialog, 1500);
        }
        ` : ""}
        ${showMenu ? `/* v0.11.32: reveal-menu's init() blocks on loading
         * menu.css via the network — its DOM-construction callback
         * only fires inside the stylesheet load handler. We bundle
         * the CSS inline (revealMenuCss is injected into the
         * document head above), so the network load 404s and the
         * callback never runs → no hamburger button. Call
         * initialiseMenu() explicitly once Reveal is ready to
         * bypass the network wait. */
        (function () {
          var callInit = function () {
            try {
              if (typeof Reveal.getPlugin !== 'function') return;
              var menuPlugin = Reveal.getPlugin('menu');
              if (!menuPlugin) return;
              if (typeof menuPlugin.isMenuInitialised === 'function' &&
                  menuPlugin.isMenuInitialised()) {
                return;
              }
              if (typeof menuPlugin.initialiseMenu === 'function') {
                menuPlugin.initialiseMenu();
              }
            } catch (err) {
              console.warn('[slides-ng] menu init failed', err);
            }
          };
          if (revealInit && typeof revealInit.then === 'function') {
            revealInit.then(callInit);
          } else if (typeof Reveal.on === 'function') {
            Reveal.on('ready', callInit);
          } else {
            setTimeout(callInit, 200);
          }
        })();` : ""}
        ${!embedded ? `/* v0.11.36/v0.11.37: expose configured scenes
         * on BOTH window (window.opener path) and localStorage (more
         * reliable cross-window for same-origin file:// pages —
         * window.opener can be stripped in some browser configs). */
        try { window.__slidesNgScenes = ${scenesJson}; } catch (_) {}
        try {
          localStorage.setItem('slides-ng-scenes', JSON.stringify(${scenesJson}));
        } catch (_) {}
        /* v0.11.33: standalone-only enhancements —
         * (a) Grid button in the top-right corner that opens the
         *     thumbnail-grid overlay (same as the embedded preview's
         *     Grid toolbar button + the G keyboard shortcut).
         * (b) S key opens a speaker-view popup window with two
         *     synced iframes (current + next slide), the active
         *     slide's notes, and a running timer.
         * Both are skipped when the page loads inside another iframe
         * (window.self !== window.top) so the speaker-view popup's
         * own iframes don't double-bind these handlers. */
        if (window.self === window.top) {
          (function setupStandaloneEnhancements() {
            try {
              /* === Grid button === */
              var gridBtn = document.createElement('button');
              gridBtn.id = 'slides-ng-grid-btn';
              gridBtn.title = 'Show all slides (G)';
              gridBtn.setAttribute('aria-label', 'Grid view');
              // v0.11.40: filled 3x3 grid dots so the button reads
              // unambiguously as "grid" — the previous 2x2 outlined-
              // squares icon was being mistaken for the reveal-menu
              // close (X) glyph when both buttons appeared at once.
              gridBtn.innerHTML =
                '<svg viewBox="0 0 24 24" width="20" height="20" ' +
                'fill="currentColor" stroke="none">' +
                '<rect x="3"  y="3"  width="5" height="5" rx="1"/>' +
                '<rect x="9.5" y="3"  width="5" height="5" rx="1"/>' +
                '<rect x="16" y="3"  width="5" height="5" rx="1"/>' +
                '<rect x="3"  y="9.5" width="5" height="5" rx="1"/>' +
                '<rect x="9.5" y="9.5" width="5" height="5" rx="1"/>' +
                '<rect x="16" y="9.5" width="5" height="5" rx="1"/>' +
                '<rect x="3"  y="16" width="5" height="5" rx="1"/>' +
                '<rect x="9.5" y="16" width="5" height="5" rx="1"/>' +
                '<rect x="16" y="16" width="5" height="5" rx="1"/>' +
                '</svg>';
              gridBtn.style.cssText =
                'position:fixed;top:12px;right:12px;z-index:9999;' +
                'background:rgba(0,0,0,0.45);color:#fff;' +
                'border:1px solid rgba(255,255,255,0.2);' +
                'border-radius:6px;padding:6px;cursor:pointer;' +
                'opacity:0.55;transition:opacity 80ms ease, background 80ms ease;' +
                'display:flex;align-items:center;justify-content:center;';
              gridBtn.onmouseenter = function () {
                gridBtn.style.opacity = '1';
                gridBtn.style.background = 'rgba(0,0,0,0.8)';
              };
              gridBtn.onmouseleave = function () {
                gridBtn.style.opacity = '0.55';
                gridBtn.style.background = 'rgba(0,0,0,0.45)';
              };
              gridBtn.onclick = function () {
                window.postMessage(
                  { type: 'slides-ng-cmd', cmd: 'toggleOverview' },
                  '*'
                );
              };
              document.body.appendChild(gridBtn);

              /* === G keyboard shortcut for the same grid ===
               * v0.11.40: capture-phase + stopImmediatePropagation so
               * reveal's own keydown handler never sees the G — its
               * stock binding opens a "jump to slide" number input
               * which the user saw popping up after closing the grid. */
              document.addEventListener('keydown', function (e) {
                if (e.key !== 'g' && e.key !== 'G') return;
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                window.postMessage(
                  { type: 'slides-ng-cmd', cmd: 'toggleOverview' },
                  '*'
                );
              }, true);

              /* === M keyboard shortcut to toggle the hamburger menu
               * v0.11.40. reveal-menu's stock M binding only OPENS the
               * menu; pressing M again does nothing because the open
               * menu becomes the focus target and reveal-menu's
               * keydown listener is rooted on the slide deck. We
               * register our own handler in the capture phase so M
               * round-trips even when the menu's open. */
              document.addEventListener('keydown', function (e) {
                if (e.key !== 'm' && e.key !== 'M') return;
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                try {
                  if (typeof Reveal === 'undefined' || typeof Reveal.getPlugin !== 'function') return;
                  var mp = Reveal.getPlugin('menu');
                  if (!mp) return;
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  var open = false;
                  try { open = typeof mp.isOpen === 'function' ? !!mp.isOpen() : false; } catch (_) { open = false; }
                  if (!open) {
                    var menuEl = document.querySelector('.slide-menu');
                    open = !!(menuEl && menuEl.classList.contains('active'));
                  }
                  if (open && typeof mp.closeMenu === 'function') {
                    mp.closeMenu();
                  } else if (typeof mp.toggle === 'function') {
                    mp.toggle();
                  } else if (typeof mp.openMenu === 'function') {
                    mp.openMenu();
                  }
                } catch (err) {
                  console.warn('[slides-ng] M toggle failed', err);
                }
              }, true);

              /* === Q keyboard shortcut to exit fullscreen + close
               * overlays. v0.11.40. The user expected Q to behave
               * like Esc — leave full-screen presentation mode and
               * dismiss any open overlay (grid, menu, scene). */
              document.addEventListener('keydown', function (e) {
                if (e.key !== 'q' && e.key !== 'Q') return;
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                try {
                  if (document.fullscreenElement && document.exitFullscreen) {
                    document.exitFullscreen();
                  }
                } catch (_) {}
                try {
                  var gridEl = document.getElementById('slides-ng-grid');
                  if (gridEl) gridEl.remove();
                } catch (_) {}
                try {
                  if (typeof Reveal !== 'undefined' && typeof Reveal.getPlugin === 'function') {
                    var mpq = Reveal.getPlugin('menu');
                    if (mpq && typeof mpq.closeMenu === 'function') {
                      var menuElQ = document.querySelector('.slide-menu');
                      var openQ = !!(menuElQ && menuElQ.classList.contains('active'));
                      if (openQ) mpq.closeMenu();
                    }
                  }
                } catch (_) {}
                try {
                  var sceneEl = document.getElementById('slides-ng-scene');
                  if (sceneEl && sceneEl.classList.contains('on')) {
                    window.postMessage({ type: 'slides-ng-cmd', cmd: 'clearScene' }, '*');
                  }
                } catch (_) {}
              }, true);

              /* === Click-to-progress (v0.11.41, opt-in via settings) ===
               * PowerPoint-style: a click anywhere on a slide that
               * isn't an interactive element (link, button, input, …)
               * advances to the next slide. Reveal\\'s own \`controls\`
               * + \`mouseWheel\` flags don\\'t cover bare slide-area
               * clicks — we install our own delegating listener. */
              ${clickToProgress ? `
              document.addEventListener('click', function (e) {
                try {
                  var t = e.target;
                  if (!t) return;
                  if (typeof Reveal === 'undefined') return;
                  /* Walk up looking for an interactive ancestor so we
                   * don\\'t hijack links, buttons, form controls,
                   * reveal-menu items, or the picker tiles. */
                  var node = t;
                  for (var i = 0; node && i < 12; i++, node = node.parentElement) {
                    var tag = node.tagName;
                    if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' ||
                        tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'LABEL' ||
                        tag === 'SUMMARY' || tag === 'DETAILS') return;
                    if (node.getAttribute && node.getAttribute('role') === 'button') return;
                    if (node.classList && (
                      node.classList.contains('slide-menu') ||
                      node.classList.contains('slide-menu-button') ||
                      node.classList.contains('slide-menu-panel') ||
                      node.classList.contains('reveal') === false &&
                      node.id === 'slides-ng-grid'
                    )) return;
                  }
                  /* Also skip if there\\'s an open grid overlay or
                   * scene overlay — clicks there shouldn\\'t advance. */
                  if (document.getElementById('slides-ng-grid')) return;
                  var sceneOpen = document.getElementById('slides-ng-scene');
                  if (sceneOpen && sceneOpen.classList.contains('on')) return;
                  Reveal.next();
                } catch (_) { /* swallow — non-fatal */ }
              });
              ` : ""}
              /* === Speaker view popup (S key) === */
              var speakerWin = null;
              function buildSpeakerPopupHtml(deckUrl) {
                /* Generated as a string so we can srcdoc-inject it
                 * into the popup. The popup contains two iframes
                 * each pointing at the same exported HTML; we
                 * postMessage 'goto idx' into each one to set the
                 * current and next slide. Notes + timer live in
                 * the popup directly. */
                return [
                  '<!doctype html><html><head>',
                  '<meta charset="utf-8">',
                  '<title>Slides NG — Speaker view</title>',
                  '<style>',
                  'html, body { margin: 0; height: 100%; background: #1a1a1a; color: #fff; font-family: sans-serif; }',
                  'body { display: grid; grid-template-rows: auto 1fr 1fr; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px; box-sizing: border-box; }',
                  '.scenes-bar { grid-column: 1 / -1; background: #0a0a0a; border: 1px solid #333; border-radius: 6px; padding: 0.4rem 0.6rem; display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }',
                  '.scenes-bar .scene-label { font-size: 0.75em; color: #999; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 0.4rem; }',
                  '.scene-btn { background: #2a2a2a; color: #e0e0e0; border: 1px solid #444; border-radius: 4px; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.85em; transition: background 80ms ease, border-color 80ms ease; }',
                  '.scene-btn:hover { background: #3a3a3a; border-color: #555; }',
                  '.scene-btn.active { background: var(--r-link-color, #42affa); color: #fff; border-color: var(--r-link-color, #42affa); }',
                  '.scene-btn.clear { margin-left: auto; background: transparent; border-color: #555; }',
                  '.panel { background: #0a0a0a; border: 1px solid #333; overflow: hidden; display: flex; flex-direction: column; border-radius: 6px; min-height: 0; }',
                  '.label { font-size: 0.75em; color: #999; padding: 0.3rem 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; flex: 0 0 auto; }',
                  /* v0.11.46: lock the iframe's aspect ratio to the
                   * deck's slide aspect so reveal scales it identically
                   * to the main window. Without this lock the iframe
                   * filled the panel cell at whatever ratio the cell
                   * happened to be, and reveal scaled differently in
                   * the popup vs the main window — same slide, different
                   * apparent content / clipping. The wrapper centers
                   * the aspect-locked box within the panel cell. */
                  '.frame-wrap { position: relative; flex: 1 1 auto; display: flex; align-items: center; justify-content: center; min-height: 0; }',
                  '.frame-aspect { position: relative; width: 100%; max-height: 100%; aspect-ratio: var(--slides-ng-aspect, 960 / 700); background: #000; }',
                  '.frame-aspect iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; pointer-events: none; }',
                  '.notes { padding: 0.6rem 0.8rem; overflow-y: auto; flex: 1 1 auto; font-size: 1em; line-height: 1.5; }',
                  '.notes .empty { color: #666; font-style: italic; }',
                  '.notes br { display: block; margin-bottom: 0.5em; }',
                  '.timer-wrap { display: flex; align-items: center; justify-content: center; flex: 1 1 auto; }',
                  '.timer { font-family: monospace; font-size: 3.5em; color: #e0e0e0; }',
                  '.timer-controls { display: flex; gap: 0.4rem; margin-top: 0.5rem; justify-content: center; }',
                  '.timer-controls button { background: #222; color: #ccc; border: 1px solid #444; padding: 0.25rem 0.6rem; border-radius: 4px; cursor: pointer; font-size: 0.85em; }',
                  '.timer-controls button:hover { background: #333; }',
                  '.slide-counter { position: absolute; top: 6px; left: 8px; background: rgba(0,0,0,0.6); padding: 2px 6px; border-radius: 4px; font-size: 0.75em; }',
                  '</style></head><body>',
                  '<div class="scenes-bar" id="scenes-bar">',
                  '  <span class="scene-label">Scenes</span>',
                  '  <!-- scene buttons injected at runtime from window.opener.__slidesNgScenes -->',
                  '  <button class="scene-btn clear" id="scene-clear">Clear</button>',
                  '</div>',
                  '<div class="panel">',
                  '  <div class="label">Current slide</div>',
                  '  <div class="frame-wrap"><div class="frame-aspect"><iframe id="current-frame" src="' + deckUrl + '" sandbox="allow-scripts allow-same-origin"></iframe><div class="slide-counter" id="current-counter">—</div></div></div>',
                  '</div>',
                  '<div class="panel">',
                  '  <div class="label">Next slide</div>',
                  '  <div class="frame-wrap"><div class="frame-aspect"><iframe id="next-frame" src="' + deckUrl + '" sandbox="allow-scripts allow-same-origin"></iframe><div class="slide-counter" id="next-counter">—</div></div></div>',
                  '</div>',
                  '<div class="panel">',
                  '  <div class="label">Speaker notes</div>',
                  '  <div class="notes" id="notes"><span class="empty">(waiting for sync…)</span></div>',
                  '</div>',
                  '<div class="panel">',
                  '  <div class="label">Timer</div>',
                  /* v0.11.42: default-paused timer + Start/Pause/Reset
                   * triplet. Was Reset+Pause where the timer auto-ran
                   * from popup-open. Per user request: starts paused
                   * (00:00), explicit Start button to begin.
                   * v0.11.42: also add an in-popup navigation row so
                   * the speaker can drive the deck without alt-tabbing
                   * back to the main window. */
                  /* v0.11.67: timer modes matching in-Obsidian view.
                   * Mode dropdown + countdown-minutes input (visible
                   * only in countdown mode). Default elapsed. */
                  '  <div class="timer-wrap">',
                  '    <div class="timer-controls" style="margin-bottom:0.4rem;justify-content:center;flex-wrap:wrap;">',
                  '      <select id="timer-mode" style="background:#222;color:#ccc;border:1px solid #444;padding:0.2rem 0.4rem;border-radius:4px;font-size:0.85em;">',
                  '        <option value="elapsed">Elapsed</option>',
                  '        <option value="countdown">Countdown</option>',
                  '        <option value="lap">Lap (reset per slide)</option>',
                  '      </select>',
                  '      <input type="number" id="timer-countdown-min" value="30" min="1" max="999" style="background:#222;color:#ccc;border:1px solid #444;padding:0.2rem 0.3rem;border-radius:4px;font-size:0.85em;width:48px;display:none;" />',
                  '      <span id="timer-countdown-unit" style="color:#999;font-size:0.75em;align-self:center;display:none;">min</span>',
                  '    </div>',
                  '    <div><div class="timer" id="timer">00:00</div>',
                  '    <div class="timer-controls"><button id="timer-pause">Start</button><button id="timer-reset">Reset</button></div></div>',
                  '  </div>',
                  '</div>',
                  /* v0.11.67: slide picker grid. Auto-fitting tile
                   * layout reading slide titles from window.opener\\'s
                   * deck DOM. Click a tile → goto that slide. */
                  '<div class="panel" style="grid-column: 1 / -1; min-height: 0;">',
                  '  <div class="label" style="display:flex;justify-content:space-between;align-items:center;padding-right:0.6rem;">',
                  '    <span>Slides</span>',
                  '    <span id="nav-counter" style="color:#999;font-size:0.85em;font-weight:normal;text-transform:none;letter-spacing:normal;">—</span>',
                  '  </div>',
                  '  <div id="slide-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;padding:0.4rem 0.6rem;max-height:260px;overflow-y:auto;">',
                  '    <!-- tiles injected at runtime -->',
                  '  </div>',
                  '  <div style="display:flex;gap:0.4rem;padding:0.3rem 0.6rem;border-top:1px solid #333;">',
                  '    <button id="nav-prev" class="scene-btn">← Prev</button>',
                  '    <button id="nav-next" class="scene-btn">Next →</button>',
                  '    <button id="nav-first" class="scene-btn" style="margin-left:auto;">⏮ First</button>',
                  '    <button id="nav-last" class="scene-btn">Last ⏭</button>',
                  '  </div>',
                  '</div>',
                  '<script>',
                  /* v0.11.46: read the deck\\'s authored slide width/
                   * height from the opener\\'s Reveal config so the
                   * popup iframes mirror the deck\\'s slide aspect. */
                  '(function () {',
                  '  try {',
                  '    var w = 960, h = 700;',
                  '    if (window.opener && window.opener.Reveal && typeof window.opener.Reveal.getConfig === "function") {',
                  '      var cfg = window.opener.Reveal.getConfig();',
                  '      if (cfg && cfg.width) w = cfg.width;',
                  '      if (cfg && cfg.height) h = cfg.height;',
                  '    }',
                  '    document.documentElement.style.setProperty("--slides-ng-aspect", w + " / " + h);',
                  '  } catch (_) {}',
                  '})();',
                  /* v0.11.42/v0.11.67: paused-default timer with three
                   * modes — elapsed / countdown / lap. Lap resets on
                   * every slide change (handled below in applyState).
                   * Countdown counts down from N minutes, going
                   * negative + red after overrun. */
                  'var start = Date.now();',
                  'var paused = true;',
                  'var pausedAt = Date.now();',
                  'var lastSlideIdx = null;',
                  'function fmt(ms, neg) {',
                  '  var s = Math.floor(Math.abs(ms) / 1000);',
                  '  var m = Math.floor(s / 60);',
                  '  var h = Math.floor(m / 60);',
                  '  m = m % 60; s = s % 60;',
                  '  var pad = function(n) { return (n < 10 ? "0" : "") + n; };',
                  '  var sign = neg ? "-" : "";',
                  '  return sign + (h > 0 ? pad(h) + ":" : "") + pad(m) + ":" + pad(s);',
                  '}',
                  'function getTimerMode() {',
                  '  var sel = document.getElementById("timer-mode");',
                  '  return sel ? sel.value : "elapsed";',
                  '}',
                  'function applyTimerLabel() {',
                  '  var t = document.getElementById("timer");',
                  '  if (!t) return;',
                  '  var elapsed = paused ? (pausedAt - start) : (Date.now() - start);',
                  '  var mode = getTimerMode();',
                  '  if (mode === "countdown") {',
                  '    var minInput = document.getElementById("timer-countdown-min");',
                  '    var minutes = minInput ? parseFloat(minInput.value) || 30 : 30;',
                  '    var targetMs = minutes * 60 * 1000;',
                  '    var remaining = targetMs - elapsed;',
                  '    t.textContent = fmt(Math.abs(remaining), remaining < 0);',
                  '    t.style.color = remaining < 0 ? "#ff6b6b" : (elapsed / targetMs >= 0.8 ? "#ffa94d" : "");',
                  '  } else {',
                  '    t.textContent = fmt(elapsed, false);',
                  '    t.style.color = "";',
                  '  }',
                  '}',
                  'setInterval(applyTimerLabel, 250);',
                  /* Timer mode dropdown wiring + countdown-input show/hide. */
                  '(function () {',
                  '  var sel = document.getElementById("timer-mode");',
                  '  var inp = document.getElementById("timer-countdown-min");',
                  '  var unit = document.getElementById("timer-countdown-unit");',
                  '  function syncCountdownVisibility() {',
                  '    var show = sel.value === "countdown";',
                  '    if (inp) inp.style.display = show ? "" : "none";',
                  '    if (unit) unit.style.display = show ? "" : "none";',
                  '    applyTimerLabel();',
                  '  }',
                  '  if (sel) sel.addEventListener("change", syncCountdownVisibility);',
                  '  if (inp) inp.addEventListener("input", applyTimerLabel);',
                  '  syncCountdownVisibility();',
                  '})();',
                  /* Reset: timer to 00:00, paused. */
                  'document.getElementById("timer-reset").onclick = function () { start = Date.now(); paused = true; pausedAt = Date.now(); document.getElementById("timer-pause").textContent = "Start"; applyTimerLabel(); };',
                  /* v0.11.67: slide grid — build tiles from window.opener\\'s
                   * deck DOM (slide titles). Click → goto N. */
                  'function buildSlideGrid() {',
                  '  var grid = document.getElementById("slide-grid");',
                  '  if (!grid) return;',
                  '  function setEmptyMsg(msg) {',
                  '    grid.textContent = "";',
                  '    var d = document.createElement("div");',
                  '    d.style.color = "#888";',
                  '    d.style.fontSize = "0.85em";',
                  '    d.style.padding = "0.4rem";',
                  '    d.textContent = msg;',
                  '    grid.appendChild(d);',
                  '  }',
                  '  if (!window.opener || window.opener.closed) {',
                  '    setEmptyMsg("(opener window not available)");',
                  '    return;',
                  '  }',
                  '  try {',
                  '    var openerDoc = window.opener.document;',
                  '    var sections = openerDoc.querySelectorAll(".reveal .slides > section");',
                  '    if (!sections.length) {',
                  '      setEmptyMsg("(no slides found)");',
                  '      return;',
                  '    }',
                  '    grid.innerHTML = "";',
                  '    for (var i = 0; i < sections.length; i++) {',
                  '      var sec = sections[i];',
                  '      var heading = sec.querySelector("h1, h2, h3");',
                  '      var title = heading ? (heading.textContent || "").trim().slice(0, 60) : "(slide " + (i + 1) + ")";',
                  '      var tile = document.createElement("button");',
                  '      tile.setAttribute("data-idx", String(i));',
                  '      tile.className = "slide-tile";',
                  '      tile.style.cssText = "background:#1a1a1a;color:#e0e0e0;border:1px solid #333;border-radius:4px;padding:6px 8px;cursor:pointer;text-align:left;font-family:inherit;font-size:0.78em;line-height:1.25;min-height:48px;display:flex;flex-direction:column;gap:3px;transition:background 80ms ease, border-color 80ms ease;";',
                  '      var num = document.createElement("div");',
                  '      num.textContent = String(i + 1);',
                  '      num.style.cssText = "color:#888;font-size:0.85em;font-weight:600;";',
                  '      var ttl = document.createElement("div");',
                  '      ttl.textContent = title;',
                  '      ttl.style.cssText = "color:#e0e0e0;line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;";',
                  '      tile.appendChild(num);',
                  '      tile.appendChild(ttl);',
                  '      tile.addEventListener("click", (function (idx) {',
                  '        return function () { navCmd("goto", idx); };',
                  '      })(i));',
                  '      tile.addEventListener("mouseenter", function () { this.style.background = "#2a2a2a"; this.style.borderColor = "#444"; });',
                  '      tile.addEventListener("mouseleave", function () { this.style.background = "#1a1a1a"; this.style.borderColor = "#333"; });',
                  '      grid.appendChild(tile);',
                  '    }',
                  '  } catch (e) {',
                  '    setEmptyMsg("(unable to read opener slides: " + e.message + ")");',
                  '  }',
                  '}',
                  'function highlightCurrentTile(idx) {',
                  '  var tiles = document.querySelectorAll(".slide-tile");',
                  '  for (var i = 0; i < tiles.length; i++) {',
                  '    var isCurrent = parseInt(tiles[i].getAttribute("data-idx") || "-1", 10) === idx;',
                  '    tiles[i].style.borderColor = isCurrent ? "#42affa" : "#333";',
                  '    tiles[i].style.boxShadow = isCurrent ? "0 0 0 2px rgba(66,175,250,0.25)" : "";',
                  '  }',
                  '}',
                  'setTimeout(buildSlideGrid, 400);',
                  /* v0.11.42: broadcast nav/scene cmds to BOTH the
                   * opener (main deck) AND the popup\\'s current-frame
                   * iframe so the speaker sees a mirror of what the
                   * audience sees. The next-frame iframe gets the
                   * adjusted idx via the regular state-sync path. */
                  'function broadcastCmd(msg) {',
                  '  try { if (window.opener && !window.opener.closed) window.opener.postMessage(msg, "*"); } catch (_) {}',
                  '  ["current-frame", "next-frame"].forEach(function (id) {',
                  '    var f = document.getElementById(id);',
                  '    if (f && f.contentWindow) { try { f.contentWindow.postMessage(msg, "*"); } catch (_) {} }',
                  '  });',
                  '}',
                  '/* v0.11.36: scene buttons built dynamically from',
                  ' * window.opener.__slidesNgScenes. Click sends setScene',
                  ' * (id + pre-rendered html) to the opener via',
                  ' * window.opener.postMessage. Clear sends clearScene. */',
                  'var activeSceneBtn = null;',
                  /* v0.11.42: sendScene mirrors to opener AND the
                   * popup\\'s "Current slide" iframe. v0.11.43: do NOT
                   * mirror to next-frame — a scene is a takeover
                   * (blackout, coffee, etc.) of the CURRENT slide,
                   * not a preview of upcoming content. */
                  'function sendScene(cmd, payload) {',
                  '  var msg = { type: "slides-ng-cmd", cmd: cmd };',
                  '  if (payload && payload.id !== undefined) msg.id = payload.id;',
                  '  if (payload && payload.html !== undefined) msg.html = payload.html;',
                  '  try { if (window.opener && !window.opener.closed) window.opener.postMessage(msg, "*"); } catch (_) {}',
                  '  var cf = document.getElementById("current-frame");',
                  '  if (cf && cf.contentWindow) { try { cf.contentWindow.postMessage(msg, "*"); } catch (_) {} }',
                  '}',
                  'function buildSceneButtons() {',
                  '  var bar = document.getElementById("scenes-bar");',
                  '  if (!bar) return;',
                  '  var clearBtn = document.getElementById("scene-clear");',
                  '  /* v0.11.37: try window.opener first, fall back to',
                  '   * localStorage. opener can be stripped by browser',
                  '   * cross-origin-opener-policy in some configs. */',
                  '  var scenes = [];',
                  '  try {',
                  '    if (window.opener && window.opener.__slidesNgScenes) {',
                  '      scenes = window.opener.__slidesNgScenes;',
                  '    }',
                  '  } catch (_) {}',
                  '  if (!Array.isArray(scenes) || scenes.length === 0) {',
                  '    try {',
                  '      var raw = localStorage.getItem("slides-ng-scenes");',
                  '      if (raw) scenes = JSON.parse(raw);',
                  '    } catch (_) {}',
                  '  }',
                  '  /* Strip any previously-built scene buttons (skip the',
                  '   * label span + Clear). */',
                  '  Array.from(bar.querySelectorAll(".scene-btn:not(.clear)")).forEach(function (b) { b.remove(); });',
                  '  if (!Array.isArray(scenes) || scenes.length === 0) {',
                  '    /* No scenes configured — hide the bar entirely',
                  '     * (the Clear button would be alone otherwise). */',
                  '    bar.style.display = "none";',
                  '    return;',
                  '  }',
                  '  scenes.forEach(function (sc) {',
                  '    if (!sc || !sc.id) return;',
                  '    var btn = document.createElement("button");',
                  '    btn.className = "scene-btn";',
                  '    btn.setAttribute("data-scene-id", sc.id);',
                  '    btn.textContent = sc.label || sc.id;',
                  '    btn.addEventListener("click", function () {',
                  '      if (activeSceneBtn === btn) {',
                  '        sendScene("clearScene");',
                  '        btn.classList.remove("active");',
                  '        activeSceneBtn = null;',
                  '        return;',
                  '      }',
                  '      if (activeSceneBtn) activeSceneBtn.classList.remove("active");',
                  '      btn.classList.add("active");',
                  '      activeSceneBtn = btn;',
                  '      sendScene("setScene", { id: sc.id, html: sc.contentHtml || "" });',
                  '    });',
                  '    /* Insert before the Clear button so Clear stays',
                  '     * pinned to the right. */',
                  '    bar.insertBefore(btn, clearBtn);',
                  '  });',
                  '}',
                  'buildSceneButtons();',
                  'document.getElementById("scene-clear").addEventListener("click", function () {',
                  '  sendScene("clearScene");',
                  '  if (activeSceneBtn) { activeSceneBtn.classList.remove("active"); activeSceneBtn = null; }',
                  '});',
                  /* v0.11.42: Start/Pause/Resume toggle. Initial label
                   * is "Start" (timer is paused on open). After first
                   * click → "Pause"; subsequent → "Resume" / "Pause". */
                  'document.getElementById("timer-pause").onclick = function () {',
                  '  if (paused) { start = Date.now() - (pausedAt - start); paused = false; this.textContent = "Pause"; }',
                  '  else { pausedAt = Date.now(); paused = true; this.textContent = "Resume"; }',
                  '};',
                  /* v0.11.42: navigation row. Speaker controls Prev /
                   * Next / First / Last from inside the popup. Updates
                   * arrive via state-sync so the counter stays current
                   * even if the main window navigates via keyboard. */
                  /* v0.11.59: nav commands go ONLY to the opener (the main
                   * deck window). The popup\\'s current-frame +
                   * next-frame iframes update via state-sync — when
                   * the opener navigates, postStateToSpeaker fires and
                   * tells the popup which slide each iframe should show.
                   *
                   * The previous broadcastCmd path posted nav cmds to
                   * BOTH opener and the popup iframes. Rapid clicks
                   * (e.g. Next-Next-Next) caused jitter: each iframe
                   * received its own Reveal.next() AND a stream of
                   * gotoSlide(N) updates from state-sync, and the two
                   * pipelines fell out of phase. Single source of
                   * truth (the opener) fixes it. */
                  'function navCmd(c, idx) {',
                  '  var msg = { type: "slides-ng-cmd", cmd: c };',
                  '  if (typeof idx === "number") msg.idx = idx;',
                  '  try { if (window.opener && !window.opener.closed) window.opener.postMessage(msg, "*"); } catch (_) {}',
                  '}',
                  'document.getElementById("nav-prev").addEventListener("click", function () { navCmd("prev"); });',
                  'document.getElementById("nav-next").addEventListener("click", function () { navCmd("next"); });',
                  'document.getElementById("nav-first").addEventListener("click", function () { navCmd("first"); });',
                  'document.getElementById("nav-last").addEventListener("click", function () { navCmd("last"); });',
                  /* Keyboard shortcuts INSIDE the popup so the speaker
                   * can hit arrow keys without focusing the main
                   * window. PgUp/PgDn + arrows. */
                  'document.addEventListener("keydown", function (e) {',
                  '  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;',
                  '  if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); navCmd("next"); }',
                  '  else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); navCmd("prev"); }',
                  '  else if (e.key === "Home") { e.preventDefault(); navCmd("first"); }',
                  '  else if (e.key === "End") { e.preventDefault(); navCmd("last"); }',
                  '});',
                  '/* v0.11.34: iframe-load gating. The popup\\'s inner',
                  ' * iframes need to finish loading the deck before they can',
                  ' * respond to postMessage goto commands. We queue any',
                  ' * pending state and replay once both iframes report load.',
                  ' * Also poke more aggressively + on iframe load events. */',
                  'var iframesLoaded = { current: false, next: false };',
                  'var pendingState = null;',
                  'function applyPending() {',
                  '  if (!pendingState) return;',
                  '  if (!iframesLoaded.current || !iframesLoaded.next) return;',
                  '  var d = pendingState;',
                  '  pendingState = null;',
                  '  gotoFrame("current-frame", d.idx);',
                  '  gotoFrame("next-frame", Math.min(d.idx + 1, d.totalSlides - 1));',
                  '}',
                  /* v0.11.60: cancel any pending burst-posts for the
                   * same iframe before scheduling new ones. The
                   * previous burst (4 posts at 0/100/300/700ms) was
                   * meant to handle iframe-not-ready-yet, but during
                   * rapid Prev/Next clicks the older bursts kept
                   * firing OLD target indexes, fighting the newer
                   * ones — caused user-reported jitter where slides
                   * bounced back and forth. */
                  'var gotoFrameTimers = {};',
                  'function gotoFrame(id, idx) {',
                  '  var f = document.getElementById(id);',
                  '  if (!f || !f.contentWindow) return;',
                  '  /* Cancel any pending posts for this iframe. */',
                  '  if (gotoFrameTimers[id] && gotoFrameTimers[id].length) {',
                  '    for (var ti = 0; ti < gotoFrameTimers[id].length; ti++) {',
                  '      clearTimeout(gotoFrameTimers[id][ti]);',
                  '    }',
                  '  }',
                  '  gotoFrameTimers[id] = [];',
                  '  function post() {',
                  '    try {',
                  '      f.contentWindow.postMessage({ type: "slides-ng-cmd", cmd: "goto", idx: idx }, "*");',
                  '    } catch (_) {}',
                  '  }',
                  '  post();',
                  '  gotoFrameTimers[id].push(setTimeout(post, 100));',
                  '  gotoFrameTimers[id].push(setTimeout(post, 300));',
                  '  gotoFrameTimers[id].push(setTimeout(post, 700));',
                  '}',
                  '/* v0.11.37: receive state from EITHER channel —',
                  ' * postMessage (primary if opener is reachable) OR',
                  ' * localStorage (works even when opener was stripped). */',
                  'var SPEAKER_STATE_KEY = "slides-ng-speaker-state";',
                  'function applyState(d) {',
                  '  if (!d || d.type !== "slides-ng-speaker-update") return;',
                  '  var notesEl = document.getElementById("notes");',
                  '  if (notesEl) {',
                  /* v0.11.41: HTML5 unquoted attribute value — avoids
                   * a nested-string escaping bug. The previous
                   * "<span class=\\"empty\\">" form lost a layer of
                   * backslashes after template-literal processing,
                   * which caused the popup\\'s "empty" identifier to
                   * leak out of the surrounding JS string at popup-
                   * parse time. The popup script then SyntaxError\\'d,
                   * which is why the timer never moved, scenes never
                   * rendered, and notes stayed at "(waiting for sync)". */
                  '    notesEl.innerHTML = d.notesHtml ? d.notesHtml : "<span class=empty>(no notes for this slide)</span>";',
                  '  }',
                  '  var cur = document.getElementById("current-counter");',
                  '  var nxt = document.getElementById("next-counter");',
                  '  if (cur) cur.textContent = (d.idx + 1) + " / " + d.totalSlides;',
                  '  if (nxt) nxt.textContent = d.idx + 2 > d.totalSlides ? "end" : ((d.idx + 2) + " / " + d.totalSlides);',
                  /* v0.11.42: also update the bottom navigation counter
                   * (slide N of M) so the speaker has the same readout
                   * next to the Prev/Next buttons. */
                  '  var navc = document.getElementById("nav-counter");',
                  '  if (navc) navc.textContent = "Slide " + (d.idx + 1) + " of " + d.totalSlides;',
                  /* v0.11.67: lap-mode timer resets on slide change. */
                  '  if (lastSlideIdx !== null && lastSlideIdx !== d.idx && getTimerMode() === "lap") {',
                  '    var wasRunning = !paused;',
                  '    start = Date.now();',
                  '    pausedAt = Date.now();',
                  '    if (!wasRunning) paused = true;',
                  '    applyTimerLabel();',
                  '  }',
                  '  lastSlideIdx = d.idx;',
                  /* v0.11.67: highlight the current tile in the slide
                   * grid. Build grid lazily if not built yet. */
                  '  if (typeof highlightCurrentTile === "function") highlightCurrentTile(d.idx);',
                  '  pendingState = d;',
                  '  applyPending();',
                  '}',
                  'window.addEventListener("message", function (e) {',
                  '  applyState(e.data);',
                  '});',
                  '/* localStorage primary read. Try immediately + retry',
                  ' * a couple times in case the opener hasn\\'t pushed',
                  ' * state yet at popup load. */',
                  'function tryLocalStorageState() {',
                  '  try {',
                  '    var raw = localStorage.getItem(SPEAKER_STATE_KEY);',
                  '    if (raw) applyState(JSON.parse(raw));',
                  '  } catch (_) {}',
                  '}',
                  'tryLocalStorageState();',
                  'setTimeout(tryLocalStorageState, 400);',
                  'setTimeout(tryLocalStorageState, 1200);',
                  '/* Storage events fire on OTHER windows of the same',
                  ' * origin when localStorage changes — so when the',
                  ' * opener writes new state on slidechanged, we get',
                  ' * notified without any postMessage. */',
                  'window.addEventListener("storage", function (e) {',
                  '  if (e.key !== SPEAKER_STATE_KEY || !e.newValue) return;',
                  '  try { applyState(JSON.parse(e.newValue)); } catch (_) {}',
                  '});',
                  '/* Mark iframes as loaded so applyPending can fire. */',
                  'function markLoaded(id, key) {',
                  '  var f = document.getElementById(id);',
                  '  if (!f) return;',
                  '  f.addEventListener("load", function () {',
                  '    iframesLoaded[key] = true;',
                  '    setTimeout(function () { poke(); applyPending(); }, 200);',
                  '  });',
                  '}',
                  'markLoaded("current-frame", "current");',
                  'markLoaded("next-frame", "next");',
                  '/* Ask the opener for a refresh repeatedly until we have state. */',
                  'function poke() {',
                  '  if (window.opener) {',
                  '    try { window.opener.postMessage({ type: "slides-ng-speaker-poke" }, "*"); } catch (_) {}',
                  '  }',
                  '}',
                  'setTimeout(poke, 100);',
                  'setTimeout(poke, 400);',
                  'setTimeout(poke, 1000);',
                  'setTimeout(poke, 2500);',
                  'setTimeout(poke, 5000);',
                  '<\\/script>',
                  '</body></html>',
                ].join('\\n');
              }
              /* v0.11.37: localStorage-based sync is the primary
               * channel (works cross-window for same-origin file://
               * pages even when popup's window.opener is null or
               * Cross-Origin-Opener-Policy strips the reference).
               * postMessage is kept as a secondary path. */
              var SPEAKER_STATE_KEY = 'slides-ng-speaker-state';
              function buildStatePayload() {
                try {
                  var idx = Reveal.getIndices().h;
                  var sections = document.querySelectorAll('.reveal .slides > section');
                  var section = sections[idx];
                  var noteEl = section ? section.querySelector('aside.notes') : null;
                  return {
                    type: 'slides-ng-speaker-update',
                    idx: idx,
                    totalSlides: Reveal.getTotalSlides(),
                    notesHtml: noteEl ? noteEl.innerHTML : '',
                    ts: Date.now(),
                  };
                } catch (_) {
                  return null;
                }
              }
              function postStateToSpeaker() {
                var payload = buildStatePayload();
                if (!payload) return;
                /* Write to localStorage first — every popup window
                 * at the same origin can read it. Use a timestamp
                 * key so storage events fire even when idx is
                 * unchanged. */
                try {
                  localStorage.setItem(SPEAKER_STATE_KEY, JSON.stringify(payload));
                } catch (_) {}
                /* postMessage fallback. */
                if (speakerWin && !speakerWin.closed) {
                  try { speakerWin.postMessage(payload, '*'); } catch (_) {}
                }
              }
              Reveal.on('slidechanged', postStateToSpeaker);
              /* Push an initial state so the popup has something to
               * read immediately on open (not just after the user
               * navigates). Wait for Reveal ready first. */
              if (revealInit && typeof revealInit.then === 'function') {
                revealInit.then(postStateToSpeaker);
              } else {
                setTimeout(postStateToSpeaker, 500);
              }
              window.addEventListener('message', function (e) {
                if (e.data && e.data.type === 'slides-ng-speaker-poke') {
                  postStateToSpeaker();
                }
              });
              function openSpeakerPopup() {
                if (speakerWin && !speakerWin.closed) {
                  try { speakerWin.focus(); } catch (_) {}
                  return;
                }
                var deckUrl = location.href.split('?')[0];
                var popupHtml = buildSpeakerPopupHtml(deckUrl);
                speakerWin = window.open('', 'slides-ng-speaker-' + Date.now(), 'width=1100,height=800');
                if (!speakerWin) {
                  alert('Speaker view popup was blocked by the browser. Allow popups for this page and press S again.');
                  return;
                }
                try {
                  speakerWin.document.open();
                  speakerWin.document.write(popupHtml);
                  speakerWin.document.close();
                } catch (err) {
                  console.warn('[slides-ng] failed to write popup', err);
                }
              }
              document.addEventListener('keydown', function (e) {
                if (e.key !== 's' && e.key !== 'S') return;
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                e.preventDefault();
                openSpeakerPopup();
              });
              /* Expose for tests + power users — same trigger an
               * external script could use. */
              window.__slidesNgOpenSpeakerView = openSpeakerPopup;
              window.__slidesNgToggleGrid = function () {
                window.postMessage(
                  { type: 'slides-ng-cmd', cmd: 'toggleOverview' },
                  '*'
                );
              };
            } catch (err) {
              console.warn('[slides-ng] standalone enhancements failed', err);
            }
          })();
        }` : ""}
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
            // v0.11.18: also re-apply the picker strip layout when
            // the iframe resizes. The auto-fill grid needs its inner
            // tile scale recomputed because the actual cell width
            // changes with container width.
            try {
              var pickerStrip = document.getElementById('slides-ng-picker-strip');
              if (pickerStrip && typeof applyPickerStripLayout === 'function') {
                applyPickerStripLayout(pickerStrip);
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
        if (existing) {
          // v0.11.22d: disconnect the previous strip's RO before
          // discarding so the old observer doesn't keep firing into
          // a detached element.
          if (existing.__slidesNgRo) {
            try { existing.__slidesNgRo.disconnect(); } catch (_) {}
          }
          existing.remove();
        }
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
        // v0.11.22d: dedicated ResizeObserver on the strip element
        // itself. The general-purpose setupRelayoutGuard ResizeObserver
        // (line 615+ in this file) watches document.documentElement
        // but has a 2-px size-delta guard + rAF debounce that swallowed
        // sub-perceptual width changes from speaker-pane resize. A
        // per-strip RO with no guard makes the picker reflow on every
        // pixel of viewport change — the user-reported "tiles change
        // when you cycle modes but not on the fly" bug.
        if (typeof window.ResizeObserver === 'function') {
          var stripRo = new ResizeObserver(function () {
            var live = document.getElementById('slides-ng-picker-strip');
            if (live) applyPickerStripLayout(live);
          });
          stripRo.observe(strip);
          strip.__slidesNgRo = stripRo;
        }
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
        // v0.11.18b: when the strip is appended sync and layout
        // hasn't run yet, clientWidth/clientHeight can be 0. Defer to
        // the next animation frame so the measurements are real.
        if (stripInnerW <= 0 || stripInnerH <= 0) {
          requestAnimationFrame(function () { applyPickerStripLayout(strip); });
          return;
        }

        // v0.11.18 layout rewrite. Layout semantics:
        //   vertical-1   exactly 1 column; tile FILLS the strip width
        //   vertical-2   exactly 2 columns; tile fills each column
        //   horizontal   row; tile height = strip height, width by aspect
        //   auto         CSS grid auto-fill; user tile-width preset =
        //                MINIMUM cell size; columns fill the strip
        //                (this is the "maximize columns" mode)
        //
        // Previously vertical-1 / vertical-2 / horizontal accepted
        // tileWidthAttr as a hard pin, which caused tiles to be
        // smaller than their cells in fixed-column modes and left a
        // lot of empty black space (user-reported bug v0.11.17).
        // The magnifier still persists a tile-width preset, but in
        // fixed-column modes it's deliberately ignored — only auto
        // mode honours it (as MIN cell width).

        // Base strip styles per orientation.
        var stripBase =
          'position:fixed;inset:0;background:#0a0a0a;color:#fff;' +
          'z-index:5;padding:8px;box-sizing:border-box;' +
          'font-family:var(--r-main-font, "Source Sans Pro", sans-serif);';
        var minCellPx = tileWidthAttr > 0 ? tileWidthAttr : 160;
        // v0.11.22c: unified sizing model for all three vertical
        // orientations (vertical-1, vertical-2, auto). The magnifier
        // preset controls tile width in all three; orientation just
        // caps the column count.
        //
        //   - vertical-1: forced to 1 column
        //   - vertical-2: forced to 2 columns
        //   - auto: as many columns as fit at preset size
        //
        // Tile width = min(preset, availableColumnWidth). When preset
        // is smaller than available, tiles stay at preset size and
        // leftover horizontal space centers (justify-content:center).
        // When preset is bigger than available, tiles fill the column
        // (so on narrow strips with 1-col mode they grow to strip
        // width — same outcome as the old "fill" behavior).
        //
        // Solves three problems at once:
        //   - vertical-1 tiles compressed to 4px tall by flex-shrink
        //     (was display:flex with default flex:0 1 auto on items)
        //   - vertical-2 tiles huge at wide strips (~567px each)
        //   - auto with comfortable/big collapsing identically at
        //     narrow strips
        //
        // All three now use display:grid + explicit column widths so
        // the same pixel-pin guarantee applies and the same
        // justify-content:center centers any horizontal leftover.
        var autoCols = 1;
        var autoTileW = 0;
        var isVerticalGrid =
          orientation === 'auto' ||
          orientation === 'vertical-1' ||
          orientation === 'vertical-2';
        if (isVerticalGrid) {
          var targetCols;
          if (orientation === 'vertical-1') {
            targetCols = 1;
          } else if (orientation === 'vertical-2') {
            targetCols = 2;
          } else {
            // auto: as many cols as fit at preset size, min 1.
            targetCols = Math.max(
              1,
              Math.floor((stripInnerW + 6) / (minCellPx + 6))
            );
          }
          var totalGap = (targetCols - 1) * 6;
          var availColW = Math.max(
            40,
            Math.floor((stripInnerW - totalGap) / targetCols)
          );
          autoTileW = Math.max(40, Math.min(minCellPx, availColW));
          autoCols = targetCols;
        }
        if (orientation === 'horizontal') {
          strip.style.cssText = stripBase +
            'display:flex;gap:6px;align-items:center;' +
            'flex-direction:row;overflow-x:auto;overflow-y:hidden;';
        } else if (isVerticalGrid) {
          strip.style.cssText = stripBase +
            'display:grid;' +
            'grid-template-columns:repeat(' + autoCols + ', ' + autoTileW + 'px);' +
            'gap:6px;align-content:start;justify-content:center;' +
            'overflow-y:auto;overflow-x:hidden;';
        }

        // Tile dimensions per orientation.
        var tileW, tileH;
        if (orientation === 'horizontal') {
          // v0.11.23: magnifier preset now sets tile WIDTH in
          // horizontal mode too. Tile height = preset * aspect. If
          // that would exceed strip height, clamp height to fit and
          // recompute width to preserve aspect.
          // Preset = 0 (auto) keeps the original "fill strip height"
          // behaviour for backward compatibility.
          var stripFloor = Math.max(40, stripInnerH > 0 ? stripInnerH - 8 : 80);
          if (tileWidthAttr > 0) {
            tileW = tileWidthAttr;
            tileH = Math.round(tileW * aspect);
            if (tileH > stripFloor) {
              tileH = stripFloor;
              tileW = Math.round(tileH / aspect);
            }
          } else {
            tileH = stripFloor;
            tileW = Math.round(tileH / aspect);
          }
        } else {
          // All three vertical orientations share the pixel-pinned
          // autoTileW computed above.
          tileW = autoTileW;
          tileH = Math.round(tileW * aspect);
        }
        // v0.11.18b: pixel-pin tile dimensions for ALL modes. The
        // aspect-ratio/width:100% approach was correct in theory but
        // the post-rAF scale measure raced with iframe layout and
        // sometimes left tiles at slideW-sized inner content (the
        // "content overflows tile" bug from v0.11.18). Pixel pins are
        // robust and the scale value matches the actual tile width
        // since we control both.
        //
        // For auto mode, tileW is the MIN cell size; CSS grid
        // auto-fill spreads tiles wider when there's room. We measure
        // the actual rendered tile width post-rAF and rescale only
        // for auto.
        var tiles = strip.querySelectorAll('.slides-ng-picker-tile');
        var scale = tileW / slideW;
        tiles.forEach(function (t) {
          // v0.11.21: pixel-pin tile dimensions for ALL modes,
          // including auto. The earlier width:100%+aspect-ratio
          // approach for auto was racy — clientHeight didn't always
          // settle to tileW * aspect before the inner content's
          // transform was applied, so content rendered unscaled.
          // We now compute autoTileW deterministically from strip
          // width and minCellPx, and tileW/tileH match it.
          // v0.11.22b: flex:0 0 auto (no grow, no shrink) is
          // essential for vertical-1 too. The strip flex container
          // (display:flex; flex-direction:column; overflow-y:auto)
          // applies default flex-shrink:1, which squashed each tile
          // to just its border (4 px tall) when the deck had many
          // slides — they got proportionally compressed to fit the
          // strip's apparent height instead of overflowing into
          // scroll. Was only set for horizontal previously; needs to
          // apply to every flex mode. Grid modes ignore the rule.
          var sizeCss =
            'width:' + tileW + 'px;height:' + tileH + 'px;' +
            'flex:0 0 auto;';
          t.style.cssText =
            'position:relative;' + sizeCss +
            'background:' + stripBodyBg + ';border:2px solid rgba(255,255,255,0.18);' +
            'border-radius:6px;padding:0;cursor:pointer;overflow:hidden;color:#fff;' +
            'font:inherit;display:block;';
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
        // v0.11.21: ResizeObserver per-tile (added in v0.11.20) is no
        // longer needed because every mode now pins tile width in
        // pixels — the inline transform set above already matches the
        // rendered tile size. The relayout hook re-invokes
        // applyPickerStripLayout on iframe resize, which recomputes
        // tileW from the new stripInnerW and writes fresh styles.
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
          /* v0.11.57: PREFER THE THEME CSS VARIABLES. Reading
           * getComputedStyle(.reveal-viewport).color returns the
           * hardcoded "rgb(0, 0, 0)" from reveal core CSS — the
           * black theme defines --r-background-color and
           * --r-main-color but never APPLIES them to .reveal-viewport
           * (variables are just declared). So the probe order needs
           * to be:
           *   1. :root CSS variable (theme intent, authoritative)
           *   2. body / viewport computed style (fallback)
           *   3. hardcoded defaults
           *
           * The previous v0.11.50 order hit the viewport computed
           * style first, picking up reveal core CSS\\'s hardcoded
           * white/black — causing the user-reported
           * "Be right back" scene rendering with black text on
           * light bg in the browser speaker popup. In-Obsidian
           * worked because the iframe\\'s body had different
           * computed styles. */
          function isUseful(c) {
            return c
              && c !== 'transparent'
              && c !== 'rgba(0, 0, 0, 0)'
              && c.length > 0;
          }
          var rootCs = getComputedStyle(document.documentElement);
          var rootBg = rootCs.getPropertyValue('--r-background-color').trim();
          var rootColor = rootCs.getPropertyValue('--r-main-color').trim();
          var bodyCs = getComputedStyle(document.body);
          var viewportEl = document.querySelector('.reveal-viewport') || document.querySelector('.reveal');
          var viewportCs = viewportEl ? getComputedStyle(viewportEl) : null;
          /* Background: theme variable first. */
          if (isUseful(rootBg)) bg = rootBg;
          else if (viewportCs && isUseful(viewportCs.getPropertyValue('--r-background-color').trim())) {
            bg = viewportCs.getPropertyValue('--r-background-color').trim();
          }
          else if (isUseful(bodyCs.backgroundColor)) bg = bodyCs.backgroundColor;
          else if (viewportCs && isUseful(viewportCs.backgroundColor)) bg = viewportCs.backgroundColor;
          /* Text color: theme variable first. */
          if (isUseful(rootColor)) color = rootColor;
          else if (viewportCs && isUseful(viewportCs.getPropertyValue('--r-main-color').trim())) {
            color = viewportCs.getPropertyValue('--r-main-color').trim();
          }
          else if (isUseful(bodyCs.color)) color = bodyCs.color;
          else if (viewportCs && isUseful(viewportCs.color)) color = viewportCs.color;
        }
        // v0.11.43/v0.11.44: parent the scene overlay to reveal viewport
        // element instead of document.body. Reveal sizes
        // .reveal-viewport to the slide aspect (16:9 / 4:3 / configured)
        // so the scene inherits the same shape as the slides —
        // previously it filled the iframe viewport, which often
        // does not match the slide aspect (the user-reported "not in
        // the right ratio as the actual slides" bug, esp. visible in
        // the speaker popup where iframes are roughly square).
        // Fall back to body when .reveal-viewport has not been
        // built yet (very early scene calls).
        // v0.11.44: font-size uses vmin units so the scene scales
        // with the viewport size — fixes the user-reported
        // "scrollbar shows up in speaker view" issue where the small
        // popup iframe was too narrow for the fixed 2em font.
        // overflow: hidden so even if the content does exceed the
        // available space, it clips cleanly with no scrollbar.
        var viewport = document.querySelector('.reveal-viewport');
        var positionMode = viewport ? 'absolute' : 'fixed';
        el.style.cssText =
          'position:' + positionMode + ';inset:0;background:' + bg + ';color:' + color + ';' +
          'z-index:9999;display:none;flex-direction:column;align-items:center;' +
          'justify-content:center;text-align:center;padding:5%;overflow:hidden;' +
          'box-sizing:border-box;max-width:100%;max-height:100%;' +
          'font-family:var(--r-main-font, "Source Sans Pro", sans-serif);' +
          'font-size:clamp(0.9rem, 4vmin, 2em);line-height:1.4;gap:0.5em;';
        (viewport || document.body).appendChild(el);
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
              /* v0.11.34: capture-phase listener so we beat reveal's
               * own Esc handler (which used to trigger reveal's
               * slide-selector overlay and made it look like Esc did
               * nothing). preventDefault + stopPropagation block any
               * other handlers from also seeing the key. Also remove
               * the listener when the overlay is closed by a click
               * (not just by Esc) so we don't leave stale handlers. */
              var escHandler = function (e) {
                if (e.key === 'Escape' || e.key === 'g' || e.key === 'G') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (overlay.parentNode) overlay.remove();
                  document.removeEventListener('keydown', escHandler, true);
                }
              };
              document.addEventListener('keydown', escHandler, true);
              /* When the overlay is removed by a click, also detach
               * the keydown listener so the next G keypress doesn't
               * find a stale ghost. */
              var observer = new MutationObserver(function () {
                if (!document.body.contains(overlay)) {
                  document.removeEventListener('keydown', escHandler, true);
                  observer.disconnect();
                }
              });
              observer.observe(document.body, { childList: true });
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
                    // v0.11.30: only scroll into view when this tile
                    // wasn't already marked current. The parent's
                    // burst of 7 setPickerCurrent posts (over 2.5 s,
                    // see v0.11.21) used to call scrollIntoView every
                    // time, which yanked the picker back to the
                    // clicked tile for the whole burst window if the
                    // user tried to scroll elsewhere meanwhile.
                    // First successful post does the scroll; the
                    // rest of the burst just confirms .current.
                    var wasAlreadyCurrent = t.classList.contains('current');
                    t.classList.add('current');
                    applyCurrentTileStyle(t);
                    if (!wasAlreadyCurrent) {
                      t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    }
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
