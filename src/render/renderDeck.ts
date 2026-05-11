import { Marked, type Tokens } from "marked";
import { parseDeck, type Deck, type Slide } from "../parser/parseDeck";
import {
  buildIframeHtml,
  type DeckRenderOptions,
  type SlideHtml,
} from "./revealTemplate";
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
export function renderDeck(markdown: string, filepath = "deck.md"): string {
  const deck = parseDeck(markdown, filepath);
  return renderDeckFromAst(deck);
}

/** Same as `renderDeck` but starts from a pre-parsed Deck (useful in tests). */
export function renderDeckFromAst(deck: Deck): string {
  const slides = deck.slides.map(slideToHtml);
  const opts = headmatterToOptions(deck.headmatter);
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
): DeckRenderOptions {
  const theme = typeof headmatter.theme === "string" ? headmatter.theme : undefined;
  const transition =
    typeof headmatter.transition === "string" ? headmatter.transition : undefined;
  const slideNumber =
    typeof headmatter.slideNumber === "boolean" ? headmatter.slideNumber : undefined;
  return { theme, transition, slideNumber };
}
