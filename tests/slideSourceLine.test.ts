import { describe, expect, test } from "bun:test";
import { sourceLineForSlide } from "../src/parser/slideSourceLine";
import { slideIndexFromCursor } from "../src/parser/slideIndexFromCursor";

/** Convenience: the text of the line the mapping resolves to. */
function lineText(md: string, h: number, v = 0, opts = {}): string {
  const idx = sourceLineForSlide(md, h, v, opts);
  return md.split("\n")[idx];
}

describe("sourceLineForSlide", () => {
  const deck = [
    "---",
    "theme: white",
    "---",
    "",
    "# Slide A",
    "",
    "intro",
    "",
    "--",
    "",
    "## A vertical",
    "",
    "---",
    "",
    "# Slide B",
    "",
    "# Slide C not a break",
  ].join("\n");

  test("h=0 → first content line after frontmatter", () => {
    expect(lineText(deck, 0)).toBe("# Slide A");
  });

  test("h=1 → the second horizontal slide", () => {
    expect(lineText(deck, 1)).toBe("# Slide B");
  });

  test("vertical v=1 → the sub-slide start (after --)", () => {
    expect(lineText(deck, 0, 1)).toBe("## A vertical");
  });

  test("frontmatter separators are skipped", () => {
    // line 0/2 are frontmatter `---`; must not be treated as slide 1/2.
    expect(sourceLineForSlide(deck, 0)).toBeGreaterThan(2);
  });

  test("overrun h → last line", () => {
    const idx = sourceLineForSlide(deck, 99);
    expect(idx).toBe(deck.split("\n").length - 1);
  });

  test("code-fenced --- / -- are not separators", () => {
    const md = "# A\n\n```\n---\n--\n```\n\n---\n\n# B";
    expect(lineText(md, 1)).toBe("# B");
    // the fenced ---/-- didn't create phantom slides
    expect(sourceLineForSlide(md, 2)).toBe(md.split("\n").length - 1); // overrun → last
  });

  test("auto-h1-breaks: each heading starts a slide", () => {
    const md = "# One\n\na\n\n# Two\n\nb\n\n# Three";
    expect(lineText(md, 0, 0, { autoH1Breaks: true })).toBe("# One");
    expect(lineText(md, 1, 0, { autoH1Breaks: true })).toBe("# Two");
    expect(lineText(md, 2, 0, { autoH1Breaks: true })).toBe("# Three");
  });

  test("round-trips with slideIndexFromCursor for every slide", () => {
    const md = "# A\n\nx\n\n--\n\n## A2\n\n---\n\n# B\n\n---\n\n# C";
    for (const [h, v] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [2, 0],
    ]) {
      const line = sourceLineForSlide(md, h, v);
      expect(slideIndexFromCursor(md, line)).toBe(h);
    }
  });
});
