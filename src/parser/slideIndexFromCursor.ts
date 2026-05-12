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
 *
 * Returns a 0-based slide index. Lines past the end of the document yield
 * the last slide's index.
 */
export function slideIndexFromCursor(markdown: string, cursorLine: number): number {
  const lines = markdown.split("\n");
  const stop = Math.min(cursorLine, lines.length - 1);

  let slideIdx = 0;
  let inCodeFence = false;
  let inFrontmatter = false;
  let frontmatterClosed = false;

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
        frontmatterClosed = true;
      }
      continue;
    }

    // Code-fence tracking — lines inside aren't slide separators.
    if (/^\s*```/.test(raw)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    if (trimmed === "---") {
      slideIdx++;
    }
    // Note: `--` (vertical sub-slide separator) is intentionally not counted
    // here — the cursor-follow feature targets horizontal slide alignment.
  }

  return slideIdx;
}
