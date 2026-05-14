import { peekFrontmatterFlag } from "./parseDeck";

/**
 * Map a cursor line in deck markdown → the horizontal slide index that
 * contains it.
 *
 * Rules:
 *   - The first `---\n...---` block is YAML frontmatter (line 0 only) and
 *     does NOT count as a slide separator.
 *   - Lines inside a fenced code block (```) are not counted.
 *   - A slide-separator line is `---` (or `--`) on its own, optionally
 *     followed by whitespace.
 *   - Vertical sub-slides (`--`) are flattened into the parent horizontal
 *     index; reveal.js sees them as different (h, v) coordinates but the
 *     "current horizontal slide" is what authors care about for follow.
 *   - v0.11.7: when auto-h1-breaks is enabled (setting or frontmatter
 *     flag), top-level `#` headings ALSO bump the slide index — so
 *     cursor-follow stays in sync with the auto-split deck.
 *
 * Returns a 0-based slide index. Lines past the end of the document yield
 * the last slide's index.
 */
export function slideIndexFromCursor(
  markdown: string,
  cursorLine: number,
  options: { autoH1Breaks?: boolean } = {}
): number {
  const lines = markdown.split("\n");
  const stop = Math.min(cursorLine, lines.length - 1);

  // Resolve the auto-h1-breaks effective value. Frontmatter override
  // wins over the option, same precedence as parseDeck.
  const fmOverride = peekFrontmatterFlag(markdown, "slides-ng-auto-h1-breaks");
  const autoH1 = fmOverride !== undefined ? fmOverride : !!options.autoH1Breaks;

  let slideIdx = 0;
  let inCodeFence = false;
  let inFrontmatter = false;
  let seenFirstH1 = false;
  // Track whether the most recent non-blank line was a `---` separator,
  // so an `# ` heading immediately after `---` doesn't double-bump.
  let prevNonBlankWasSeparator = false;

  for (let i = 0; i <= stop; i++) {
    const raw = lines[i] ?? "";
    const trimmed = raw.replace(/\s+$/, "");

    // YAML frontmatter detection (must start at line 0).
    if (i === 0 && trimmed === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === "---") {
        inFrontmatter = false;
      }
      continue;
    }

    // Code-fence tracking — lines inside aren't slide separators.
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
      slideIdx++;
      prevNonBlankWasSeparator = true;
      continue;
    }

    // v0.11.7: auto-h1-breaks. Each `# ` heading after the first one
    // bumps the slide index, mirroring injectH1SlideBreaks. Skip if a
    // `---` separator already preceded this heading.
    if (autoH1 && /^#\s/.test(trimmed)) {
      if (!seenFirstH1) {
        seenFirstH1 = true;
      } else if (!prevNonBlankWasSeparator) {
        slideIdx++;
      }
    }

    // Only non-blank lines reset the separator-tracking flag.
    if (trimmed !== "") {
      prevNonBlankWasSeparator = false;
    }
  }

  return slideIdx;
}
