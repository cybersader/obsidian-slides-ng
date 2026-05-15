import { Marked, type Tokens } from "marked";
import { parseDeck, type Deck, type Slide } from "../parser/parseDeck";
import {
  buildIframeHtml,
  type DeckRenderOptions,
  type SlideHtml,
} from "./revealTemplate";
export type { DeckRenderOptions } from "./revealTemplate";
import { highlight } from "./shiki";
import { applyClickReveals } from "./clickReveals";
import { parseLineStep } from "../parser/lineStep";
import { renderLineStep } from "./lineStepRenderer";
import { parseMagicMoveKey } from "../parser/magicMoveKey";
import { renderMagicMoveBlock } from "./magicMoveRenderer";
import { splitSlots, hasSlots } from "./slots";
import { applyLayout } from "./layouts";
import {
  extractSlideAttrs,
  applyElementAnnotations,
  renderAttrs,
} from "../parser/annotations";

// Build a marked instance whose code renderer threads the user's
// `codeTheme` setting into Shiki + Slidev line-step + Magic-Move. We
// rebuild per-render so the theme can change at runtime without needing
// to invalidate Shiki itself (Shiki caches grammars; switching theme is
// just a different render config).
function buildMarked(codeTheme: string | undefined): Marked {
  const inst = new Marked();
  inst.use({
    renderer: {
      code(token: Tokens.Code): string {
        const info = token.lang ?? "";
        // Priority 1: Magic-Move pairing via `{key=NAME}`.
        const mm = parseMagicMoveKey(info);
        if (mm) {
          return renderMagicMoveBlock(token.text, mm, codeTheme);
        }
        // Priority 2: Slidev line-step spec (`ts [1|2-3|all]`).
        const stepped = parseLineStep(info);
        if (stepped) {
          return renderLineStep(token.text, stepped, codeTheme);
        }
        // Plain Shiki highlight; strip non-lang info-string suffix.
        const langOnly = info.split(/\s+/)[0];
        return highlight(token.text, langOnly, codeTheme);
      },
    },
  });
  return inst;
}

/**
 * v0.11.18: separate marked instance for speaker notes. Uses
 * `breaks: true` so single newlines in multi-line `<!--\n...\n-->`
 * notes render as `<br>` — matches what users type in the
 * speaker-view notes editor. Slide BODY rendering keeps CommonMark
 * default (single newline = space) because most decks already
 * expect that.
 */
function buildNotesMarked(): Marked {
  return new Marked({ breaks: true, gfm: true });
}

/**
 * High-level renderer: takes raw markdown source and returns a complete
 * iframe-srcdoc HTML document. This is what the view assigns to its
 * `<iframe srcdoc=...>` attribute.
 */
export interface RenderDefaults {
  /** Plugin-setting defaults — overridden by per-deck frontmatter. */
  defaultTheme?: string;
  defaultTransition?: string;
  /**
   * Layout used for slides that don't set `layout:` in their frontmatter.
   * Defaults to `"default"` (single-column) when undefined.
   */
  defaultLayout?: string;
  /** Shiki theme for code blocks. Defaults to the renderer's built-in. */
  codeTheme?: string;
  /** Column split ratio for image-left / image-right layouts. */
  imageLayoutSplit?: "50/50" | "60/40" | "40/60";
  /** Line-step dimming opacity (0–1). */
  lineStepDimOpacity?: number;
  /** Show reveal's controls + progress bar even in embedded mode. */
  showRevealControlsEmbedded?: boolean;
  /** Show reveal.js-menu hamburger plugin in embedded mode. */
  showRevealMenuEmbedded?: boolean;
  /**
   * v0.11.76: render the slide-picker grid in the browser speaker
   * popup as iframe-rendered thumbnails (one iframe per slide,
   * pinned to that slide) instead of the default text-only tiles.
   * CPU/memory heavy for large decks — opt-in via the
   * experimentalPopupRenderedGrid setting.
   */
  popupRenderedGrid?: boolean;
  /**
   * v0.11.41: PowerPoint-style click-to-advance. When true, clicking
   * anywhere on a slide (outside links / interactive controls)
   * advances to the next slide. Off by default.
   */
  clickToProgress?: boolean;
  /**
   * v0.11.43: bake print-pdf mode into the exported HTML — no URL
   * query parsing needed. Lets the PDF flow bypass the
   * `?print-pdf` query mechanism entirely.
   */
  forcePrintMode?: boolean;
  /** v0.11.43: when forcePrintMode, also force showNotes. */
  forceShowNotes?: boolean;
  /** v0.11.44: bake pdfMaxPagesPerSlide into the exported HTML. */
  forceMaxPagesPerSlide?: number;
  /** v0.11.44: render as flowing document instead of slide cards. */
  forcePrintDocument?: boolean;
  /** v0.11.45: notes-emphasis PDF layout (slide on top, notes large). */
  forceNotesEmphasis?: boolean;
  /** v0.11.46: misc PDF experimentation knobs. */
  forceAutoShrink?: boolean;
  forcePageSize?: "a4" | "letter" | "legal";
  forcePageMargin?: "normal" | "narrow" | "wide" | "none";
  forceGrayscale?: boolean;
  forceHideBackgrounds?: boolean;
  forceSlideNumberStamp?: boolean;
  forceHeaderText?: string;
  forceFooterText?: string;
  /** Max-height for code blocks before they scroll. CSS length. */
  codeBlockMaxHeight?: string;
  /** Whether code blocks scroll overflow when capped. */
  codeBlockOverflowScroll?: boolean;
  /** Reveal animation pace: `default | fast | slow`. */
  transitionSpeed?: "default" | "fast" | "slow";
  /** Magic-Move animation duration (ms). */
  magicMoveDurationMs?: number;
  /**
   * PDF-export aspect-ratio overrides. When set, Reveal.initialize()
   * receives explicit width + height (reveal scales the slide to fit
   * any container while preserving the configured aspect). Default
   * undefined = use reveal's stock 960×700. v0.9.0+.
   */
  pdfAspectWidth?: number;
  pdfAspectHeight?: number;
  /**
   * v0.11.5: when true, every top-level `#` heading begins a new
   * slide automatically — no `---` separator needed. Lets authors
   * write decks as plain markdown outlines. Frontmatter
   * `slides-ng-auto-h1-breaks: true` overrides this setting on a
   * per-deck basis. Default false (keeps Slidev compat).
   */
  autoH1Breaks?: boolean;
  /**
   * v0.11.13: scenes inherit the deck theme's body bg + text color.
   * Default true. Frontmatter override:
   * `slides-ng-scene-inherit-theme-bg: false`.
   */
  sceneInheritThemeBg?: boolean;
  /**
   * v0.11.36: scenes (overlay slides) to expose in the standalone
   * export's speaker-view popup. Each entry's `content` is markdown;
   * the renderer converts it to HTML at export time. The standalone
   * export emits `window.__slidesNgScenes` with the pre-rendered
   * shape, and the speaker popup reads it via `window.opener` to
   * build its scene-button toolbar dynamically — matching whatever
   * scenes the user has configured in plugin settings.
   * Ignored in embedded mode.
   */
  scenes?: Array<{
    id: string;
    label: string;
    /** Markdown source. Rendered at export time. */
    content: string;
    icon?: string;
  }>;
  /**
   * Optional image-attachment resolver. Called with the raw `image:`
   * frontmatter value; returns a fully-qualified URL (data: URI,
   * file://, https://, etc.) or null if the resolver couldn't find
   * the asset. The view supplies a real implementation via
   * `app.vault.adapter.getResourcePath()`; unit tests can pass null
   * or a mock. When omitted, the raw `image:` value is used as-is
   * (works for absolute URLs).
   */
  resolveImage?: (path: string) => string | null;
}

export function renderDeck(
  markdown: string,
  filepath = "deck.md",
  defaults: RenderDefaults = {}
): string {
  const deck = parseDeck(markdown, filepath, {
    autoH1Breaks: defaults.autoH1Breaks,
  });
  return renderDeckFromAst(deck, {}, defaults);
}

/**
 * Standalone variant — same content, but Reveal.js initialises in
 * non-embedded mode so the user's default browser can drive fullscreen
 * (F key), keyboard shortcuts, the speaker view (S key), and print
 * mode (`?print-pdf` query string). Used by the "Open in browser"
 * export workflow.
 */
export function renderDeckStandalone(
  markdown: string,
  filepath = "deck.md",
  defaults: RenderDefaults = {}
): string {
  const deck = parseDeck(markdown, filepath, {
    autoH1Breaks: defaults.autoH1Breaks,
  });
  return renderDeckFromAst(deck, { embedded: false }, defaults);
}

/**
 * Resolution order (lowest priority first → each layer overrides previous):
 *   1. `defaults` from plugin settings (theme, transition)
 *   2. Per-deck frontmatter values
 *   3. `overrides` passed in (e.g. {embedded:false} for standalone)
 */
export function renderDeckFromAst(
  deck: Deck,
  overrides: Partial<DeckRenderOptions> = {},
  defaults: RenderDefaults = {}
): string {
  const md = buildMarked(defaults.codeTheme);
  const notesMd = buildNotesMarked();
  const slides = deck.slides.map((s) => slideToHtml(s, md, notesMd, defaults));
  const defaultLayer: Partial<DeckRenderOptions> = {};
  if (defaults.defaultTheme) defaultLayer.theme = defaults.defaultTheme;
  if (defaults.defaultTransition) defaultLayer.transition = defaults.defaultTransition;
  if (defaults.imageLayoutSplit) defaultLayer.imageLayoutSplit = defaults.imageLayoutSplit;
  if (typeof defaults.lineStepDimOpacity === "number") {
    defaultLayer.lineStepDimOpacity = defaults.lineStepDimOpacity;
  }
  if (defaults.showRevealControlsEmbedded !== undefined) {
    defaultLayer.showRevealControlsEmbedded = defaults.showRevealControlsEmbedded;
  }
  if (defaults.showRevealMenuEmbedded !== undefined) {
    defaultLayer.showRevealMenuEmbedded = defaults.showRevealMenuEmbedded;
  }
  if (defaults.popupRenderedGrid !== undefined) {
    defaultLayer.popupRenderedGrid = defaults.popupRenderedGrid;
  }
  if (defaults.clickToProgress !== undefined) {
    defaultLayer.clickToProgress = defaults.clickToProgress;
  }
  if (defaults.forcePrintMode !== undefined) {
    defaultLayer.forcePrintMode = defaults.forcePrintMode;
  }
  if (defaults.forceShowNotes !== undefined) {
    defaultLayer.forceShowNotes = defaults.forceShowNotes;
  }
  if (typeof defaults.forceMaxPagesPerSlide === "number") {
    defaultLayer.forceMaxPagesPerSlide = defaults.forceMaxPagesPerSlide;
  }
  if (defaults.forcePrintDocument !== undefined) {
    defaultLayer.forcePrintDocument = defaults.forcePrintDocument;
  }
  if (defaults.forceNotesEmphasis !== undefined) {
    defaultLayer.forceNotesEmphasis = defaults.forceNotesEmphasis;
  }
  // v0.11.46: thread the experiment knobs through.
  if (defaults.forceAutoShrink) defaultLayer.forceAutoShrink = true;
  if (defaults.forcePageSize) defaultLayer.forcePageSize = defaults.forcePageSize;
  if (defaults.forcePageMargin) defaultLayer.forcePageMargin = defaults.forcePageMargin;
  if (defaults.forceGrayscale) defaultLayer.forceGrayscale = true;
  if (defaults.forceHideBackgrounds) defaultLayer.forceHideBackgrounds = true;
  if (defaults.forceSlideNumberStamp) defaultLayer.forceSlideNumberStamp = true;
  if (defaults.forceHeaderText) defaultLayer.forceHeaderText = defaults.forceHeaderText;
  if (defaults.forceFooterText) defaultLayer.forceFooterText = defaults.forceFooterText;
  if (defaults.codeBlockMaxHeight) {
    defaultLayer.codeBlockMaxHeight = defaults.codeBlockMaxHeight;
  }
  if (defaults.codeBlockOverflowScroll !== undefined) {
    defaultLayer.codeBlockOverflowScroll = defaults.codeBlockOverflowScroll;
  }
  if (defaults.transitionSpeed) {
    defaultLayer.transitionSpeed = defaults.transitionSpeed;
  }
  if (typeof defaults.magicMoveDurationMs === "number") {
    defaultLayer.magicMoveDurationMs = defaults.magicMoveDurationMs;
  }
  if (typeof defaults.pdfAspectWidth === "number") {
    defaultLayer.pdfAspectWidth = defaults.pdfAspectWidth;
  }
  if (typeof defaults.pdfAspectHeight === "number") {
    defaultLayer.pdfAspectHeight = defaults.pdfAspectHeight;
  }
  if (typeof defaults.sceneInheritThemeBg === "boolean") {
    defaultLayer.sceneInheritThemeBg = defaults.sceneInheritThemeBg;
  }
  // v0.11.36: render each scene's markdown content to HTML at
  // export time. The standalone speaker-view popup reads the
  // resulting array via window.opener to build its scene buttons.
  if (Array.isArray(defaults.scenes) && defaults.scenes.length > 0) {
    defaultLayer.scenes = defaults.scenes.map((s) => ({
      id: s.id,
      label: s.label,
      icon: s.icon,
      // Empty content stays empty (blackout). Otherwise: render via
      // the same breaks-aware marked instance the speaker view uses.
      contentHtml: s.content
        ? (notesMd.parse(s.content, { async: false }) as string)
        : "",
    }));
  }

  const opts: DeckRenderOptions = {
    ...defaultLayer,
    ...headmatterToOptions(deck.headmatter),
    ...overrides,
  };
  return buildIframeHtml(slides, opts);
}

/**
 * Slide-attribute keys whose values are URLs the iframe will load.
 * Vault-relative paths in these need to be resolved to `app://` via the
 * caller's `resolveImage` callback, same as `image:` frontmatter, or the
 * iframe-sandbox can't fetch the attachment.
 */
const RESOLVABLE_BACKGROUND_ATTRS = [
  "data-background-image",
  "data-background-video",
] as const;

/**
 * Walk a slide's attrs and rewrite any RESOLVABLE_BACKGROUND_ATTRS that
 * carry a vault-relative path. Pass-through for `http(s)://`, `data:`,
 * `file://`, or absolute paths.
 */
function resolveBackgroundAttrs(
  attrs: Record<string, string>,
  resolveImage: ((path: string) => string | null) | undefined
): Record<string, string> {
  if (!resolveImage) return attrs;
  const out: Record<string, string> = { ...attrs };
  for (const key of RESOLVABLE_BACKGROUND_ATTRS) {
    const val = out[key];
    if (typeof val !== "string" || val.length === 0) continue;
    if (/^(https?:|data:|file:|\/)/.test(val)) continue;
    const resolved = resolveImage(val);
    if (resolved) out[key] = resolved;
  }
  return out;
}

function slideToHtml(
  slide: Slide,
  md: Marked,
  notesMd: Marked,
  defaults: RenderDefaults = {}
): SlideHtml {
  // 1. Extract Slides-Extended-style slide annotations from the raw
  //    markdown before anything else touches it. The cleaned content
  //    is what flows into the slot splitter / markdown→HTML pass.
  const { content: cleanedContent, attrs: rawSlideAttrs } = extractSlideAttrs(
    slide.content
  );
  // 1b. Resolve any vault-relative `data-background-image` /
  // `data-background-video` paths via the same callback the `image:`
  // frontmatter uses.
  const slideAttrs = resolveBackgroundAttrs(rawSlideAttrs, defaults.resolveImage);

  // Frontmatter keys: prefer the `slides-ng-`-prefixed namespace
  // (introduced in v0.7.1 to avoid collisions with other vault plugins);
  // fall back to the unprefixed form for backward compat with older decks.
  const fmLayout = readStringFrontmatter(
    slide.frontmatter,
    "slides-ng-layout",
    "layout"
  );
  const layoutName = fmLayout && fmLayout.length > 0
    ? fmLayout
    : (defaults.defaultLayout ?? "default");

  // 2. Every slide flows through a layout, even `default`, so the iframe
  //    CSS can target `.slides-ng-layout` uniformly. Slot splitting only
  //    matters when the content actually uses `::name::` markers — for
  //    the common case, there's exactly one slot (`default`).
  const slotMarkdown = hasSlots(cleanedContent)
    ? splitSlots(cleanedContent)
    : { default: cleanedContent };

  const slotHtml: Record<string, string> = {};
  for (const [name, src] of Object.entries(slotMarkdown)) {
    // Per-slot v-click translation so fragments in `::left::` don't
    // leak into `::right::` and vice versa.
    let html = md.parse(src, { async: false }) as string;
    // 3. Element-level `<!-- element attr=val -->` annotations are
    //    applied after marked has emitted HTML — they fold into the
    //    previous sibling element.
    html = applyElementAnnotations(html);
    slotHtml[name] = applyClickReveals(html);
  }

  // 4. Image-layout support: when `slides-ng-image:` (or the legacy
  //    `image:` for back-compat) is set in the slide frontmatter,
  //    inject a synthesized `image` slot. The image-* layouts read
  //    this slot; non-image layouts ignore it.
  const fmImage = readStringFrontmatter(
    slide.frontmatter,
    "slides-ng-image",
    "image"
  );
  if (fmImage && fmImage.length > 0) {
    const resolved = defaults.resolveImage ? defaults.resolveImage(fmImage) : null;
    const src = resolved ?? fmImage;
    slotHtml.image = `<img class="slides-ng-image" src="${escapeAttrValue(src)}" alt="">`;
  }

  const body = applyLayout(layoutName, slotHtml);

  // v0.11.18: notes use a separate marked instance with breaks:true
  // so multi-line speaker notes (written by the speaker-view editor
  // as `<!--\nline1\nline2\n-->`) render with `<br>` between lines.
  // The slide-body marked stays CommonMark-default.
  // v0.11.47: also honour `<!-- slide notes="..." -->` (Slides-Extended
  // style). The `notes` attribute on the slide annotation gets promoted
  // to a speaker note. If both forms exist on the same slide, the
  // canonical @slidev `note` field wins (last-one-wins is consistent
  // with how multi-annotation attrs merge).
  const slideAttrNotes = slideAttrs.notes;
  const noteSource = slide.note ?? slideAttrNotes;
  // Don't leak the notes attribute onto the rendered <section> tag.
  if (slideAttrNotes !== undefined) {
    delete slideAttrs.notes;
  }
  const noteHtml = noteSource ? (notesMd.parse(noteSource, { async: false }) as string) : undefined;

  // v0.11.15: per-slide panel-visibility override. Emit a
  // `data-hide-panels="picker,scenes"` attribute on the section
  // when the slide's frontmatter sets `slides-ng-hide-panels:
  // [picker, scenes]`. The iframe's `postState` reads this
  // attribute from `Reveal.getCurrentSlide()` and posts it up;
  // the speaker view hides those panels while the slide is
  // active, restoring them when navigating to a slide without
  // the override.
  const hidePanelsRaw = slide.frontmatter["slides-ng-hide-panels"];
  if (hidePanelsRaw) {
    let list: string[] = [];
    if (Array.isArray(hidePanelsRaw)) {
      list = hidePanelsRaw.filter((p): p is string => typeof p === "string");
    } else if (typeof hidePanelsRaw === "string") {
      list = hidePanelsRaw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (list.length > 0) {
      slideAttrs["data-hide-panels"] = list.join(",");
    }
  }

  // 4. Slide-level annotations land on the `<section>` tag itself.
  const sectionAttrs =
    Object.keys(slideAttrs).length > 0 ? renderAttrs(slideAttrs) : undefined;

  return { body, noteHtml, sectionAttrs };
}

function escapeAttrValue(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Read a frontmatter value that may live under the new `slides-ng-`-
 * prefixed key OR the legacy unprefixed key. Returns the string value
 * or undefined. Backward-compat for decks authored before v0.7.1.
 */
function readStringFrontmatter(
  matter: Record<string, unknown>,
  prefixedKey: string,
  legacyKey: string
): string | undefined {
  const prefixed = matter[prefixedKey];
  if (typeof prefixed === "string") return prefixed;
  const legacy = matter[legacyKey];
  if (typeof legacy === "string") return legacy;
  return undefined;
}

/**
 * Read a boolean frontmatter value across the prefixed/legacy keys.
 */
function readBoolFrontmatter(
  matter: Record<string, unknown>,
  prefixedKey: string,
  legacyKey: string
): boolean | undefined {
  const prefixed = matter[prefixedKey];
  if (typeof prefixed === "boolean") return prefixed;
  const legacy = matter[legacyKey];
  if (typeof legacy === "boolean") return legacy;
  return undefined;
}

/** Read a raw value (any type) across the prefixed/legacy keys. */
function readRawFrontmatter(
  matter: Record<string, unknown>,
  prefixedKey: string,
  legacyKey: string
): unknown {
  if (matter[prefixedKey] !== undefined) return matter[prefixedKey];
  return matter[legacyKey];
}

/**
 * Read a number frontmatter value across prefixed/legacy keys.
 * Accepts integer-or-float YAML values OR numeric strings ("5", "1.5").
 * Returns undefined if absent / not parseable.
 */
function readNumberFrontmatter(
  matter: Record<string, unknown>,
  prefixedKey: string,
  legacyKey: string
): number | undefined {
  const raw = readRawFrontmatter(matter, prefixedKey, legacyKey);
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = parseFloat(raw);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function headmatterToOptions(
  headmatter: Record<string, unknown>
): Partial<DeckRenderOptions> {
  const out: Partial<DeckRenderOptions> = {};
  // Each lookup prefers the prefixed key; legacy unprefixed is the
  // fallback. v0.7.1+ documentation recommends the prefixed form to
  // avoid collisions with other vault plugins.
  const theme = readStringFrontmatter(headmatter, "slides-ng-theme", "theme");
  if (theme) out.theme = theme;
  const transition = readStringFrontmatter(
    headmatter,
    "slides-ng-transition",
    "transition"
  );
  if (transition) out.transition = transition;
  const slideNumber = readBoolFrontmatter(
    headmatter,
    "slides-ng-slide-number",
    "slideNumber"
  );
  if (slideNumber !== undefined) out.slideNumber = slideNumber;
  const speed = readStringFrontmatter(
    headmatter,
    "slides-ng-transition-speed",
    "transitionSpeed"
  );
  if (speed === "default" || speed === "fast" || speed === "slow") {
    out.transitionSpeed = speed;
  }
  // customCSS: string | string[]. Both forms get sanitized + flattened
  // before reaching the template. Rejecting `<`/`>` blocks accidental
  // script-tag breakouts within the iframe `<style>` we emit.
  const raw = readRawFrontmatter(
    headmatter,
    "slides-ng-custom-css",
    "customCSS"
  );
  if (typeof raw === "string" || Array.isArray(raw)) {
    const blocks = Array.isArray(raw) ? raw : [raw];
    const clean: string[] = [];
    for (const block of blocks) {
      if (typeof block !== "string") continue;
      if (block.includes("<") || block.includes(">")) {
        console.warn(
          "[slides-ng] customCSS contains `<` or `>` — rejected for safety. " +
            "Use CSS rules only (no HTML, no comments containing those chars)."
        );
        continue;
      }
      const trimmed = block.trim();
      if (trimmed.length > 0) clean.push(trimmed);
    }
    if (clean.length > 0) out.customCSS = clean.join("\n");
  }

  // v0.11.9: per-deck frontmatter overrides for the rest of the
  // view-affecting plugin settings. Lets a deck author flip
  // reveal arrows on, switch the Shiki code theme, tweak Magic
  // Move timing, etc., without touching global settings. All
  // optional — absence means "fall through to plugin defaults."

  // (Note: `slides-ng-code-theme` was considered but Shiki
  // highlighting runs during markdown → HTML conversion BEFORE
  // headmatter is merged into the render options, so a per-deck
  // override wouldn't actually take effect. Use the global
  // setting instead.)

  // `slides-ng-show-controls: true` — show reveal's stock corner
  // chevron arrows in the embedded iframe.
  const showControls = readBoolFrontmatter(
    headmatter,
    "slides-ng-show-controls",
    "showControlsEmbedded"
  );
  if (showControls !== undefined) out.showRevealControlsEmbedded = showControls;

  // `slides-ng-show-menu: false` — disable the reveal-menu plugin
  // for this deck.
  const showMenu = readBoolFrontmatter(
    headmatter,
    "slides-ng-show-menu",
    "showMenuEmbedded"
  );
  if (showMenu !== undefined) out.showRevealMenuEmbedded = showMenu;

  // `slides-ng-image-layout-split: 60/40` — column ratio override
  // for the image-left / image-right layouts.
  const split = readStringFrontmatter(
    headmatter,
    "slides-ng-image-layout-split",
    "imageLayoutSplit"
  );
  if (split === "50/50" || split === "60/40" || split === "40/60") {
    out.imageLayoutSplit = split;
  }

  // `slides-ng-line-step-dim: 0.5` — dim opacity for non-active
  // code-block line-step lines.
  const dim = readNumberFrontmatter(
    headmatter,
    "slides-ng-line-step-dim",
    "lineStepDimOpacity"
  );
  if (dim !== undefined && dim >= 0 && dim <= 1) {
    out.lineStepDimOpacity = dim;
  }

  // `slides-ng-code-block-max-height: 40vh` — CSS length cap for
  // long code blocks. `"none"` disables the cap.
  const cbMax = readStringFrontmatter(
    headmatter,
    "slides-ng-code-block-max-height",
    "codeBlockMaxHeight"
  );
  if (cbMax) out.codeBlockMaxHeight = cbMax;

  // `slides-ng-code-block-overflow-scroll: false` — clip overflow
  // instead of scrolling.
  const cbScroll = readBoolFrontmatter(
    headmatter,
    "slides-ng-code-block-overflow-scroll",
    "codeBlockOverflowScroll"
  );
  if (cbScroll !== undefined) out.codeBlockOverflowScroll = cbScroll;

  // `slides-ng-magic-move-duration: 800` — Magic Move animation
  // length in ms.
  const mmDur = readNumberFrontmatter(
    headmatter,
    "slides-ng-magic-move-duration",
    "magicMoveDurationMs"
  );
  if (mmDur !== undefined && mmDur > 0) {
    out.magicMoveDurationMs = mmDur;
  }

  // `slides-ng-scene-inherit-theme-bg: false` — disable theme-bg
  // inheritance for scene overlays (Blackout, BRB, Q&A, etc.).
  // When omitted, scenes inherit the deck theme's body bg + text
  // color (the v0.11.13 default).
  const sceneInherit = readBoolFrontmatter(
    headmatter,
    "slides-ng-scene-inherit-theme-bg",
    "sceneInheritThemeBg"
  );
  if (sceneInherit !== undefined) out.sceneInheritThemeBg = sceneInherit;

  // Power-user escape hatch: `slides-ng-reveal-config:` accepts
  // an object whose keys are passed straight through to
  // Reveal.initialize(). Use with caution — invalid keys can
  // break the slide stage. Examples: `width`, `height`,
  // `autoSlide`, `loop`, `disableLayout`.
  const revealCfg = readRawFrontmatter(
    headmatter,
    "slides-ng-reveal-config",
    "revealConfig"
  );
  if (revealCfg && typeof revealCfg === "object" && !Array.isArray(revealCfg)) {
    out.revealOptions = revealCfg as Record<string, unknown>;
  }

  return out;
}
