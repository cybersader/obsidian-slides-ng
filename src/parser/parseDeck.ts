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
 * @slidev/parser pulls the last HTML comment in a slide into `note`, with
 * the `<!-- -->` delimiters stripped. That means `<!-- element class="x" -->`
 * trailing a paragraph gets misclassified as a speaker note. This regex
 * recognises the misclassification so we can re-inject those markers back
 * into the slide's content and let the annotation pipeline handle them.
 */
/*
 * v0.11.47: accept both canonical (`slide attr=...`) and Slides-
 * Extended colon form (`slide: attr=...`). When @slidev/parser pulls
 * the annotation comment into `.note`, it strips the `<!-- -->` but
 * leaves any leading colon. Without the optional `:?`, colon-form
 * annotations leak into speaker notes verbatim — user-reported in
 * v0.11.46 where every PDF page showed the literal raw annotation
 * as the speaker note. The reInjected output drops the colon so the
 * downstream annotation parser sees canonical form.
 */
const RECLASSIFY_NOTE_RE = /^\s*(slide|element):?\s+([\s\S]*?)\s*$/;

/**
 * v0.11.5: cheap regex peek into the top-of-file frontmatter to find
 * a boolean-ish value for a single named key. Avoids parsing the
 * whole YAML for a single override flag during the pre-parse step
 * (we'd be paying that cost on EVERY render). Returns `undefined`
 * when the key is absent so callers can distinguish "not set" from
 * "set to false."
 */
export function peekFrontmatterFlag(
  markdown: string,
  key: string
): boolean | undefined {
  const raw = peekFrontmatterRaw(markdown, key);
  if (raw === undefined) return undefined;
  const val = raw.toLowerCase();
  if (val === "true" || val === "yes" || val === "1") return true;
  if (val === "false" || val === "no" || val === "0") return false;
  return undefined;
}

/**
 * v0.11.17: lower-level peek that returns the raw frontmatter value
 * (lowercased, unquoted, trimmed) without coercing to bool. Returns
 * undefined when the key is absent or there's no frontmatter block.
 */
export function peekFrontmatterRaw(
  markdown: string,
  key: string
): string | undefined {
  if (!(markdown.startsWith("---\n") || markdown.startsWith("---\r\n"))) {
    return undefined;
  }
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) return undefined;
  const fm = markdown.slice(0, end);
  const re = new RegExp(
    `^${key.replace(/[-/\\^$*+?.()|[\\]{}]/g, "\\$&")}\\s*:\\s*(.*)$`,
    "m"
  );
  const m = re.exec(fm);
  if (!m) return undefined;
  return m[1].trim().toLowerCase().replace(/^["']|["']$/g, "");
}

function reclassifyNote(slide: SourceSlideInfo): {
  content: string;
  note: string | undefined;
} {
  if (!slide.note) {
    return { content: slide.content, note: undefined };
  }
  const m = RECLASSIFY_NOTE_RE.exec(slide.note);
  if (!m) {
    return { content: slide.content, note: slide.note };
  }
  // Re-inject as a proper HTML comment at the end of content so the
  // annotation parser (extractSlideAttrs / applyElementAnnotations)
  // picks it up. The kind is preserved (`slide` or `element`).
  const reInjected = `\n\n<!-- ${m[1]} ${m[2]} -->`;
  return { content: slide.content + reInjected, note: undefined };
}

/**
 * v0.11.5: pre-parse step that turns every top-level `#` heading into
 * the start of a new slide. Lets users author decks as plain markdown
 * outlines without remembering the `---` separator convention. The
 * frontmatter block (first `---\n…\n---` pair at the very top) is
 * NOT touched. Existing `---` separators are preserved — they aren't
 * doubled-up if a `#` heading already follows one.
 *
 * Pure function so it can be unit-tested in isolation.
 */
export function injectH1SlideBreaks(markdown: string): string {
  // Detect + skip the frontmatter block (if any) so we don't insert
  // a break before the very first `#` after frontmatter.
  let cursor = 0;
  let body = markdown;
  if (markdown.startsWith("---\n") || markdown.startsWith("---\r\n")) {
    const end = markdown.indexOf("\n---", 4);
    if (end !== -1) {
      // Include the trailing newline after the closing `---` if present.
      const next = markdown.indexOf("\n", end + 1);
      cursor = next === -1 ? markdown.length : next + 1;
      body = markdown.slice(cursor);
    }
  }
  // Walk lines; on the FIRST `# ` heading we leave it alone (it's the
  // current first slide). On every subsequent `# ` heading, prefix a
  // `---` separator unless one already precedes it.
  const lines = body.split("\n");
  const out: string[] = [];
  let seenFirstH1 = false;
  let inFenced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Track fenced code blocks so we don't insert breaks inside them.
    if (/^```/.test(line)) inFenced = !inFenced;
    const isH1 = !inFenced && /^#\s/.test(line);
    if (isH1) {
      if (!seenFirstH1) {
        seenFirstH1 = true;
        out.push(line);
        continue;
      }
      // Walk back past blank lines to see if the previous non-blank
      // line is already a `---` separator.
      let j = out.length - 1;
      while (j >= 0 && out[j].trim() === "") j--;
      const prevNonBlank = j >= 0 ? out[j].trim() : "";
      if (prevNonBlank === "---") {
        out.push(line);
        continue;
      }
      // Insert a separator with surrounding blank lines for safety.
      out.push("", "---", "");
      out.push(line);
      continue;
    }
    out.push(line);
  }
  return markdown.slice(0, cursor) + out.join("\n");
}

/**
 * Parse a markdown source string into our Deck representation.
 *
 * @param markdown raw markdown source (the file's contents)
 * @param filepath used only for error reporting; can be a virtual path
 * @param options.autoH1Breaks when true, every top-level `#` heading
 *   starts a new slide automatically (v0.11.5+). Default false.
 */
export function parseDeck(
  markdown: string,
  filepath = "deck.md",
  options: { autoH1Breaks?: boolean } = {}
): Deck {
  // v0.11.5: optional pre-parse to inject `---` before each H1.
  // Frontmatter override `slides-ng-auto-h1-breaks: true` takes
  // priority over the setting if either is set — checked here via
  // a small regex peek so we don't pay for a full YAML parse.
  const fmOverride = peekFrontmatterFlag(markdown, "slides-ng-auto-h1-breaks");
  const enabled = fmOverride !== undefined ? fmOverride : !!options.autoH1Breaks;
  const source = enabled ? injectH1SlideBreaks(markdown) : markdown;
  const parsed: SlidevMarkdown = parseSync(source, filepath);

  const slides: Slide[] = parsed.slides.map((s: SourceSlideInfo) => {
    const { content, note } = reclassifyNote(s);
    return {
      content,
      frontmatter: s.frontmatter,
      note,
      title: s.title,
    };
  });

  // First slide's frontmatter is conventionally the deck-level headmatter
  // in Slidev's flavor. If absent, fall back to an empty object.
  const headmatter = slides.length > 0 ? slides[0].frontmatter : {};

  return {
    headmatter,
    slides,
    errors: parsed.errors ?? [],
  };
}
