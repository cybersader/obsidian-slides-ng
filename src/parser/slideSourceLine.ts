import { peekFrontmatterFlag } from "./parseDeck";

/**
 * v0.13.6: inverse of `slideIndexFromCursor` — map a reveal.js slide
 * position (horizontal `h`, vertical `v`) back to the 0-based source
 * line where that slide's content begins. Powers the "reveal in
 * editor" button (preview → editor jump).
 *
 * Mirrors `slideIndexFromCursor`'s counting exactly so the round trip
 * is consistent:
 *   - The leading `---\n…\n---` frontmatter block is skipped.
 *   - Fenced code (```) contents are never separators.
 *   - `---` on its own line is a horizontal separator.
 *   - `--` on its own line is a VERTICAL separator (within a horizontal
 *     slide). Only consulted when `v > 0`.
 *   - With auto-h1-breaks on, each `#` heading after the first also
 *     starts a new horizontal slide.
 *
 * Returns the line of the first non-blank content of that slide, or the
 * last line if `h`/`v` overrun the document.
 */
export function sourceLineForSlide(
  markdown: string,
  h: number,
  v = 0,
  options: { autoH1Breaks?: boolean } = {}
): number {
  const lines = markdown.split("\n");
  const fmOverride = peekFrontmatterFlag(markdown, "slides-ng-auto-h1-breaks");
  const autoH1 = fmOverride !== undefined ? fmOverride : !!options.autoH1Breaks;

  let slideIdx = 0;
  let inCodeFence = false;
  let inFrontmatter = false;
  let seenFirstH1 = false;
  let prevNonBlankWasSeparator = false;
  // Phase-2 state: once we're inside the target horizontal slide, count
  // `--` vertical separators to reach sub-slide `v`.
  let vCount = 0;
  let inTargetH = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const trimmed = raw.replace(/\s+$/, "");

    if (i === 0 && trimmed === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === "---") inFrontmatter = false;
      continue;
    }

    if (/^\s*```/.test(raw)) {
      inCodeFence = !inCodeFence;
      prevNonBlankWasSeparator = false;
      if (inTargetH && vCount === v && trimmed !== "") return i;
      continue;
    }
    if (inCodeFence) {
      prevNonBlankWasSeparator = false;
      if (inTargetH && vCount === v && trimmed !== "") return i;
      continue;
    }

    if (trimmed === "---") {
      slideIdx++;
      prevNonBlankWasSeparator = true;
      inTargetH = slideIdx === h;
      vCount = 0;
      continue;
    }

    // Vertical separator inside the target horizontal slide.
    if (inTargetH && trimmed === "--") {
      vCount++;
      continue;
    }

    if (autoH1 && /^#\s/.test(trimmed)) {
      if (!seenFirstH1) {
        seenFirstH1 = true;
      } else if (!prevNonBlankWasSeparator) {
        slideIdx++;
        inTargetH = slideIdx === h;
        vCount = 0;
      }
    }

    // Update "are we in the target horizontal slide" for the h===0 case
    // (no leading separator ever set inTargetH).
    if (slideIdx === h) inTargetH = true;

    if (inTargetH && vCount === v && trimmed !== "") {
      return i;
    }
    if (trimmed !== "") prevNonBlankWasSeparator = false;
  }

  return Math.max(0, lines.length - 1);
}
