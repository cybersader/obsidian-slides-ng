import { marked } from "marked";
import { parseDeck, type Deck, type Slide } from "../parser/parseDeck";
import {
  buildIframeHtml,
  type DeckRenderOptions,
  type SlideHtml,
} from "./revealTemplate";

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
  const body = marked.parse(slide.content, { async: false }) as string;
  const noteHtml = slide.note
    ? (marked.parse(slide.note, { async: false }) as string)
    : undefined;
  return { body, noteHtml };
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
