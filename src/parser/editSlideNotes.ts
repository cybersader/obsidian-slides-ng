/**
 * Pure helpers for editing speaker notes in deck markdown.
 *
 * Notes live as a trailing HTML comment in the slide's section,
 * matching @slidev/parser's convention (the LAST HTML comment in a
 * slide becomes the speaker note).
 *
 * v0.11.16: multi-line notes are now preserved. When the textarea
 * value contains newlines, the comment is written as the slidev
 * convention `<!--\nline1\nline2\n-->` (one comment, multiple
 * lines). Single-line input still writes a single-line comment for
 * backwards-compatibility with existing decks.
 *
 * Caveats:
 *   - Slide annotations `<!-- slide ... -->` and `<!-- element ... -->`
 *     are explicitly NOT treated as notes.
 *   - v0.11.14: when the deck uses `slides-ng-auto-h1-breaks: true`
 *     (frontmatter), top-level `#` headings become slide boundaries
 *     too — `findSlideRanges` peeks the flag and treats each `#`
 *     line as a slide break, matching `parseDeck`'s behaviour.
 */

import { peekFrontmatterFlag } from "./parseDeck";

export interface SlideRange {
  /** Inclusive — first line of the slide's content. */
  startLine: number;
  /** Exclusive — the next slide's `---` separator (or EOF for the last slide). */
  endLine: number;
}

/**
 * Split a deck's markdown into per-slide line ranges. Skips the YAML
 * frontmatter block at the very top and ignores `---` lines inside
 * fenced code blocks.
 */
export function findSlideRanges(markdown: string): SlideRange[] {
  // v0.11.14: auto-h1-breaks mode. When the frontmatter flag is
  // set, top-level `#` headings count as slide separators too —
  // matches `parseDeck`'s injectH1SlideBreaks behaviour. The first
  // `#` does NOT open a new slide (it's the start of slide 0);
  // subsequent ones do. A `# ` immediately after a `---` doesn't
  // double-bump.
  const autoH1 = peekFrontmatterFlag(markdown, "slides-ng-auto-h1-breaks") === true;

  const lines = markdown.split("\n");
  const ranges: SlideRange[] = [];
  let inFrontmatter = false;
  let inCodeFence = false;
  let currentStart = 0;
  let seenFirstH1 = false;
  let prevNonBlankWasSeparator = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.replace(/\s+$/, "");

    if (i === 0 && trimmed === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === "---") {
        inFrontmatter = false;
        currentStart = i + 1;
      }
      continue;
    }

    if (/^\s*```/.test(raw)) {
      inCodeFence = !inCodeFence;
      prevNonBlankWasSeparator = false;
      continue;
    }
    if (inCodeFence) {
      prevNonBlankWasSeparator = false;
      continue;
    }

    if (trimmed === "---") {
      ranges.push({ startLine: currentStart, endLine: i });
      currentStart = i + 1;
      prevNonBlankWasSeparator = true;
      continue;
    }

    // Auto-h1-break: `# ` heading starts a new slide (except the
    // first one + when preceded immediately by `---`).
    if (autoH1 && /^#\s/.test(trimmed)) {
      if (!seenFirstH1) {
        seenFirstH1 = true;
      } else if (!prevNonBlankWasSeparator) {
        // Close the previous slide at the line BEFORE this heading.
        // Walk back past blank lines so the previous slide doesn't
        // own trailing whitespace.
        let endLine = i;
        while (endLine > currentStart && lines[endLine - 1].trim() === "") {
          endLine--;
        }
        ranges.push({ startLine: currentStart, endLine });
        currentStart = i;
      }
    }

    if (trimmed !== "") {
      prevNonBlankWasSeparator = false;
    }
  }
  if (currentStart < lines.length) {
    ranges.push({ startLine: currentStart, endLine: lines.length });
  }

  return ranges;
}

/**
 * Span (inclusive on both ends) of an existing notes comment within
 * a slide, with the comment's content already extracted and trimmed.
 * Returns null when the slide has no trailing notes comment.
 *
 * Recognises BOTH formats:
 *   - Single line:  `<!-- content -->`
 *   - Multi-line:   `<!--`  ...  `-->`  (slidev's stringify format)
 *
 * Annotations (`<!-- slide ... -->`, `<!-- element ... -->`) are
 * NOT treated as notes.
 */
export interface NotesSpan {
  startLine: number;
  endLine: number;
  content: string;
}

export function findNotesSpan(
  lines: string[],
  range: SlideRange
): NotesSpan | null {
  // Walk past trailing blank lines.
  let bottom = range.endLine - 1;
  while (bottom >= range.startLine && lines[bottom].trim() === "") bottom--;
  if (bottom < range.startLine) return null;

  const bottomTrim = lines[bottom].trim();

  // Single-line `<!-- ... -->`
  const single = /^<!--\s*([\s\S]*?)\s*-->$/.exec(bottomTrim);
  if (single) {
    const content = single[1];
    if (/^(slide|element)\s+/.test(content)) return null;
    return { startLine: bottom, endLine: bottom, content };
  }

  // Multi-line: bottom line must be just `-->` (allow trailing space).
  if (bottomTrim !== "-->") return null;
  // Walk backward for the opening `<!--` on its own line.
  let top = bottom - 1;
  while (top >= range.startLine && lines[top].trim() !== "<!--") top--;
  if (top < range.startLine) return null;
  const inner = lines.slice(top + 1, bottom).join("\n");
  const content = inner.replace(/^\s+|\s+$/g, "");
  if (/^(slide|element)\s+/.test(content)) return null;
  return { startLine: top, endLine: bottom, content };
}

/**
 * Backwards-compat shim. Returns the start line of the notes
 * comment (single- or multi-line) or -1.
 */
export function findNotesLine(lines: string[], range: SlideRange): number {
  const span = findNotesSpan(lines, range);
  return span ? span.startLine : -1;
}

/**
 * Read the existing notes markdown for a slide (the comment's content,
 * with leading/trailing whitespace trimmed) or `""` if none.
 */
export function readSlideNotes(markdown: string, slideIdx: number): string {
  const ranges = findSlideRanges(markdown);
  if (slideIdx < 0 || slideIdx >= ranges.length) return "";
  const lines = markdown.split("\n");
  const span = findNotesSpan(lines, ranges[slideIdx]);
  return span ? span.content : "";
}

/**
 * Replace (or insert) the notes for a slide. Returns the updated
 * markdown. If `newNotes` is empty/whitespace and an existing notes
 * comment is found, it's removed. If no comment exists and
 * `newNotes` is non-empty, a new comment is inserted at the end of
 * the slide (after the last non-empty content line).
 *
 * Format selection:
 *   - Single-line input → `<!-- content -->` (one line)
 *   - Multi-line input → `<!--\nline1\nline2\n-->` (slidev format)
 */
export function replaceSlideNotes(
  markdown: string,
  slideIdx: number,
  newNotes: string
): string {
  const ranges = findSlideRanges(markdown);
  if (slideIdx < 0 || slideIdx >= ranges.length) return markdown;
  const lines = markdown.split("\n");
  const range = ranges[slideIdx];
  const existing = findNotesSpan(lines, range);

  const trimmed = newNotes.replace(/^\s+|\s+$/g, "");
  const isMultiline = /\r?\n/.test(trimmed);

  let replacement: string[];
  if (trimmed.length === 0) {
    replacement = [];
  } else if (isMultiline) {
    replacement = ["<!--", ...trimmed.split(/\r?\n/), "-->"];
  } else {
    replacement = [`<!-- ${trimmed} -->`];
  }

  if (existing) {
    const count = existing.endLine - existing.startLine + 1;
    lines.splice(existing.startLine, count, ...replacement);
  } else if (replacement.length > 0) {
    // Insert at end of slide. Skip trailing blank lines.
    let insertAt = range.endLine;
    while (insertAt > range.startLine && lines[insertAt - 1].trim() === "") {
      insertAt--;
    }
    const preceding = insertAt > 0 ? lines[insertAt - 1] : "";
    if (preceding.trim().length > 0) {
      lines.splice(insertAt, 0, "", ...replacement);
    } else {
      lines.splice(insertAt, 0, ...replacement);
    }
  }

  return lines.join("\n");
}
