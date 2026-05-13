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
  const deck = parseDeck(markdown, filepath);
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
  const deck = parseDeck(markdown, filepath);
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
  const slides = deck.slides.map((s) => slideToHtml(s, md, defaults));
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

  const noteHtml = slide.note ? (md.parse(slide.note, { async: false }) as string) : undefined;

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
  return out;
}
