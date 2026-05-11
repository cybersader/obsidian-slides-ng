import { parseSync } from "@slidev/parser/core";
import type { SlidevMarkdown, SourceSlideInfo } from "@slidev/types";

/**
 * A single slide in our internal representation. Wraps Slidev's
 * SourceSlideInfo with the fields the renderer actually consumes.
 */
export interface Slide {
  /** Markdown content of the slide body (frontmatter and notes already stripped). */
  content: string;
  /** Per-slide frontmatter (Slidev syntax: `--- foo: bar ---` between separators). */
  frontmatter: Record<string, unknown>;
  /** Speaker notes (from `<!-- ... -->` at slide end). */
  note?: string;
  /** Optional explicit title (from H1). */
  title?: string;
}

/**
 * Deck-level data. `headmatter` is the top-of-file frontmatter (theme,
 * transition, etc.); slides are in order; errors carry any parser warnings.
 */
export interface Deck {
  headmatter: Record<string, unknown>;
  slides: Slide[];
  errors: { row: number; message: string }[];
}

/**
 * Parse a markdown source string into our Deck representation.
 *
 * @param markdown raw markdown source (the file's contents)
 * @param filepath used only for error reporting; can be a virtual path
 */
export function parseDeck(markdown: string, filepath = "deck.md"): Deck {
  const parsed: SlidevMarkdown = parseSync(markdown, filepath);

  const slides: Slide[] = parsed.slides.map((s: SourceSlideInfo) => ({
    content: s.content,
    frontmatter: s.frontmatter,
    note: s.note,
    title: s.title,
  }));

  // First slide's frontmatter is conventionally the deck-level headmatter
  // in Slidev's flavor. If absent, fall back to an empty object.
  const headmatter = slides.length > 0 ? slides[0].frontmatter : {};

  return {
    headmatter,
    slides,
    errors: parsed.errors ?? [],
  };
}
