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

// Local Marked instance with Shiki + Slidev line-step wired into the
// `code` renderer. Using `Marked` (a fresh instance) rather than the
// global `marked` keeps our renderer override isolated from any other
// consumer of marked elsewhere in the bundle.
const md = new Marked();
md.use({
  renderer: {
    code(token: Tokens.Code): string {
      const info = token.lang ?? "";
      // Try parsing the info string as a Slidev line-step spec first
      // (e.g. `ts [1|2-3|all]`). If it matches, render a multi-step
      // stacked block. Otherwise fall back to plain Shiki highlighting,
      // taking only the first word as the lang (the info string can
      // contain trailing non-step junk like `{monaco-diff}`).
      const stepped = parseLineStep(info);
      if (stepped) {
        return renderLineStep(token.text, stepped);
      }
      const langOnly = info.split(/\s+/)[0];
      return highlight(token.text, langOnly);
    },
  },
});

/**
 * High-level renderer: takes raw markdown source and returns a complete
 * iframe-srcdoc HTML document. This is what the view assigns to its
 * `<iframe srcdoc=...>` attribute.
 */
export interface RenderDefaults {
  /** Plugin-setting defaults — overridden by per-deck frontmatter. */
  defaultTheme?: string;
  defaultTransition?: string;
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
  const slides = deck.slides.map(slideToHtml);
  const defaultLayer: Partial<DeckRenderOptions> = {};
  if (defaults.defaultTheme) defaultLayer.theme = defaults.defaultTheme;
  if (defaults.defaultTransition) defaultLayer.transition = defaults.defaultTransition;

  const opts: DeckRenderOptions = {
    ...defaultLayer,
    ...headmatterToOptions(deck.headmatter),
    ...overrides,
  };
  return buildIframeHtml(slides, opts);
}

function slideToHtml(slide: Slide): SlideHtml {
  const body = applyClickReveals(markdownToHtml(slide.content));
  const noteHtml = slide.note ? markdownToHtml(slide.note) : undefined;
  return { body, noteHtml };
}

function markdownToHtml(text: string): string {
  return md.parse(text, { async: false }) as string;
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
