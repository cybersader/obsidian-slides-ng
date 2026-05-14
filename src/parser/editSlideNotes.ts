/**
 * Pure helpers for editing speaker notes in deck markdown.
 *
 * Notes live as a trailing HTML comment in the slide's section,
 * matching @slidev/parser's convention (the LAST HTML comment in a
 * slide becomes the speaker note).
 *
 * Caveats:
 *   - Only single-line `<!-- ... -->` comments are recognised/written.
 *     Multi-line notes are not yet supported (the user can always
 *     edit the deck file directly for that case).
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
 * Find the line index (within the slide range) of the existing notes
 * comment, or -1 if none. A "notes" comment is the LAST single-line
 * `<!-- ... -->` in the slide whose content doesn't start with
 * `slide ` or `element ` (those are annotations, not notes).
 */
export function findNotesLine(
  lines: string[],
  range: SlideRange
): number {
  for (let i = range.endLine - 1; i >= range.startLine; i--) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    const m = /^<!--\s*([\s\S]*?)\s*-->$/.exec(line);
    if (m) {
      const content = m[1];
      if (/^(slide|element)\s+/.test(content)) continue;
      return i;
    }
    // First non-empty non-comment line — stop searching.
    break;
  }
  return -1;
}

/**
 * Read the existing notes markdown for a slide (the comment's content)
 * or `""` if none.
 */
export function readSlideNotes(markdown: string, slideIdx: number): string {
  const ranges = findSlideRanges(markdown);
  if (slideIdx < 0 || slideIdx >= ranges.length) return "";
  const lines = markdown.split("\n");
  const noteLine = findNotesLine(lines, ranges[slideIdx]);
  if (noteLine === -1) return "";
  const m = /^<!--\s*([\s\S]*?)\s*-->$/.exec(lines[noteLine].trim());
  return m ? m[1] : "";
}

/**
 * Replace (or insert) the notes for a slide. Returns the updated
 * markdown. If `newNotes` is empty/whitespace and a notes line
 * exists, it's removed. If no notes line exists and `newNotes` is
 * non-empty, a new `<!-- ... -->` line is inserted at the end of
 * the slide (after the last non-empty content line).
 *
 * Multi-line newNotes is flattened to a single line (newlines → ` `)
 * since the writer only emits single-line comments.
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
  const noteLine = findNotesLine(lines, range);

  // Flatten newlines for safe single-line storage. The Speaker-view
  // editor allows multi-line input but we serialize as one line.
  const flat = newNotes.replace(/\r?\n+/g, " ").trim();

  if (noteLine !== -1) {
    if (flat.length === 0) {
      lines.splice(noteLine, 1);
    } else {
      lines[noteLine] = `<!-- ${flat} -->`;
    }
  } else if (flat.length > 0) {
    // Insert at end of slide. Skip trailing blank lines.
    let insertAt = range.endLine;
    while (insertAt > range.startLine && lines[insertAt - 1].trim() === "") {
      insertAt--;
    }
    // Add a blank line before the comment if the preceding line has content.
    const preceding = insertAt > 0 ? lines[insertAt - 1] : "";
    if (preceding.trim().length > 0) {
      lines.splice(insertAt, 0, "", `<!-- ${flat} -->`);
    } else {
      lines.splice(insertAt, 0, `<!-- ${flat} -->`);
    }
  }

  return lines.join("\n");
}
