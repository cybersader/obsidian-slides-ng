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

  const opts: DeckRenderOptions = {
    ...defaultLayer,
    ...headmatterToOptions(deck.headmatter),
    ...overrides,
  };
  return buildIframeHtml(slides, opts);
}

function slideToHtml(
  slide: Slide,
  md: Marked,
  defaults: RenderDefaults = {}
): SlideHtml {
  // 1. Extract Slides-Extended-style slide annotations from the raw
  //    markdown before anything else touches it. The cleaned content
  //    is what flows into the slot splitter / markdown→HTML pass.
  const { content: cleanedContent, attrs: slideAttrs } = extractSlideAttrs(
    slide.content
  );

  const layoutName =
    typeof slide.frontmatter.layout === "string" && slide.frontmatter.layout.length > 0
      ? slide.frontmatter.layout
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

  // 4. Image-layout support: when `image:` is in the frontmatter, inject
  //    a synthesized `image` slot containing the resolved <img> tag. The
  //    image-* layouts read this slot; non-image layouts ignore it.
  if (typeof slide.frontmatter.image === "string" && slide.frontmatter.image.length > 0) {
    const raw = slide.frontmatter.image;
    const resolved = defaults.resolveImage ? defaults.resolveImage(raw) : null;
    const src = resolved ?? raw;
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

function headmatterToOptions(
  headmatter: Record<string, unknown>
): Partial<DeckRenderOptions> {
  const out: Partial<DeckRenderOptions> = {};
  if (typeof headmatter.theme === "string") out.theme = headmatter.theme;
  if (typeof headmatter.transition === "string") out.transition = headmatter.transition;
  if (typeof headmatter.slideNumber === "boolean") out.slideNumber = headmatter.slideNumber;
  return out;
}
