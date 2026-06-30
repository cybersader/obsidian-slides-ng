/**
 * v0.13.5: reveal.js vertical sub-slides via `--` separators.
 * Authoring: `---` splits horizontal slides; `--` (a line that is
 * exactly two dashes) splits vertical sub-slides within a horizontal
 * one. Rendered as nested <section><section></section></section>.
 */
import { describe, expect, test } from "bun:test";
import { renderDeck } from "../src/render/renderDeck";

/** The rendered `.slides` region (excludes bundled CSS / script). */
function slidesRegion(full: string): string {
  const a = full.indexOf('class="slides"');
  const b = a >= 0 ? full.indexOf("<script", a) : -1;
  return a >= 0 && b >= 0 ? full.slice(a, b) : full;
}
/** Count top-level (horizontal) sections — direct children of .slides. */
function nestedSectionPairs(region: string): number {
  return (region.match(/<section>\s*<section/g) ?? []).length;
}

describe("vertical sub-slides (--)", () => {
  test("`--` splits content into nested sections", () => {
    const md = "# A\n\nfirst\n\n--\n\nsecond\n\n--\n\nthird\n";
    const region = slidesRegion(renderDeck(md, "d.md"));
    expect(nestedSectionPairs(region)).toBe(1); // one vertical stack
    // three inner sections inside the stack
    expect(region).toContain("first");
    expect(region).toContain("second");
    expect(region).toContain("third");
  });

  test("no `--` → a single (non-nested) section", () => {
    const md = "# A\n\njust one slide\n";
    const region = slidesRegion(renderDeck(md, "d.md"));
    expect(nestedSectionPairs(region)).toBe(0);
  });

  test("`--` mixed with `---` horizontal separators", () => {
    const md = "# A\n\na1\n\n--\n\na2\n\n---\n\n# B\n\nb1\n";
    const region = slidesRegion(renderDeck(md, "d.md"));
    // A is a vertical stack; B is a plain slide.
    expect(nestedSectionPairs(region)).toBe(1);
    expect(region).toContain("a1");
    expect(region).toContain("a2");
    expect(region).toContain("b1");
  });

  test("`--` inside a fenced code block does NOT split", () => {
    const md = "# A\n\n```\nline1\n--\nline2\n```\n";
    const region = slidesRegion(renderDeck(md, "d.md"));
    expect(nestedSectionPairs(region)).toBe(0); // not split
  });

  test("a `--` within text (not its own line) does not split", () => {
    const md = "# A\n\nwait -- this is an aside -- really\n";
    const region = slidesRegion(renderDeck(md, "d.md"));
    expect(nestedSectionPairs(region)).toBe(0);
  });

  test("image inside a vertical sub-slide resolves", () => {
    const md = "# A\n\nintro\n\n--\n\n![[pic.png]]\n";
    const region = slidesRegion(
      renderDeck(md, "d.md", { resolveImage: (p) => `data:image/png;base64,Z${p}` })
    );
    expect(nestedSectionPairs(region)).toBe(1);
    expect(region).toContain('src="data:image/png;base64,Zpic.png"');
  });

  test("trailing `--` doesn't create an empty vertical sub-slide", () => {
    const md = "# A\n\nonly\n\n--\n";
    const region = slidesRegion(renderDeck(md, "d.md"));
    // single real part → no nested stack
    expect(nestedSectionPairs(region)).toBe(0);
    expect(region).toContain("only");
  });

  test("trailing speaker note attaches to the LAST vertical sub-slide", () => {
    // Slidev extracts only a trailing `<!-- … -->` as the slide note;
    // it was authored after the last `--`, so it belongs to the last
    // sub-slide.
    const md = "# A\n\nfirst\n\n--\n\nsecond\n\n<!-- a speaker note -->\n";
    const region = slidesRegion(renderDeck(md, "d.md"));
    expect(region).toContain('<aside class="notes">');
    // the note lands AFTER "second" (the last sub-slide), not after "first"
    const firstIdx = region.indexOf("first");
    const noteIdx = region.indexOf('class="notes"');
    const secondIdx = region.indexOf("second");
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(noteIdx).toBeGreaterThan(secondIdx);
  });
});
