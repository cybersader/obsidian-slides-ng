import { test, expect, describe } from "bun:test";
import { TEMPLATES, findTemplate, locateCursor } from "../src/templates";

describe("template registry shape", () => {
  test("each entry has name + description + expand()", () => {
    for (const t of TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(typeof t.expand).toBe("function");
      const { text, cursorOffset } = t.expand();
      expect(text.length).toBeGreaterThan(0);
      expect(cursorOffset).toBeGreaterThanOrEqual(0);
      expect(cursorOffset).toBeLessThanOrEqual(text.length);
    }
  });

  test("ships at least 10 templates", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });

  test("template names are unique", () => {
    const names = TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("note template wraps the cursor inside an HTML comment", () => {
    const t = findTemplate("note")!;
    const { text, cursorOffset } = t.expand();
    expect(text.startsWith("<!--")).toBe(true);
    expect(text.endsWith("-->")).toBe(true);
    // Cursor offset points to a position inside the comment (between
    // the open and close marker).
    expect(text.slice(0, cursorOffset)).toContain("<!--");
    expect(text.slice(cursorOffset)).toContain("-->");
  });

  test("cover template includes `layout: cover` frontmatter", () => {
    const t = findTemplate("cover")!;
    const { text } = t.expand();
    expect(text).toContain("---\nlayout: cover\n---");
    expect(text).toContain("# ");
  });

  test("slidev-two-cols template includes both slot markers", () => {
    // v0.13.0: renamed from "two-cols" → "slidev-two-cols" to
    // disambiguate from the new HTML `::twocol` snippet. The Slidev
    // layout system itself (frontmatter `layout: two-cols`) is
    // unchanged — only the snippet name moved.
    const t = findTemplate("slidev-two-cols")!;
    const { text } = t.expand();
    expect(text).toContain("layout: two-cols");
    expect(text).toContain("::left::");
    expect(text).toContain("::right::");
  });

  test("auto-animate template has two paired sections with data-id", () => {
    const t = findTemplate("auto-animate")!;
    const { text } = t.expand();
    const slideAnnotations = text.match(/<!-- slide data-auto-animate -->/g) ?? [];
    expect(slideAnnotations.length).toBe(2);
    expect(text).toContain('data-id="');
  });

  test("v-clicks template includes the wrapping tags", () => {
    const t = findTemplate("v-clicks")!;
    const { text } = t.expand();
    expect(text).toContain("<v-clicks>");
    expect(text).toContain("</v-clicks>");
  });

  test("fragment template uses element annotation", () => {
    const t = findTemplate("fragment")!;
    const { text } = t.expand();
    expect(text).toContain('<!-- element class="fragment" -->');
  });

  test("code-step template uses Slidev info-string syntax", () => {
    const t = findTemplate("code-step")!;
    const { text } = t.expand();
    expect(text).toContain("```ts [");
    expect(text).toContain("|");
    expect(text).toContain("]");
  });
});

describe("findTemplate", () => {
  test("returns the template by exact name", () => {
    expect(findTemplate("note")?.name).toBe("note");
    expect(findTemplate("cover")?.name).toBe("cover");
  });

  test("undefined for unknown names", () => {
    expect(findTemplate("not-a-thing")).toBeUndefined();
    expect(findTemplate("")).toBeUndefined();
  });
});

describe("locateCursor", () => {
  test("single-line text — column-only offset", () => {
    expect(locateCursor(3, "hello", 2)).toEqual({ line: 3, ch: 2 });
  });

  test("multi-line text — counts newlines, resets ch on each", () => {
    expect(locateCursor(0, "abc\ndef", 0)).toEqual({ line: 0, ch: 0 });
    expect(locateCursor(0, "abc\ndef", 3)).toEqual({ line: 0, ch: 3 });
    expect(locateCursor(0, "abc\ndef", 4)).toEqual({ line: 1, ch: 0 });
    expect(locateCursor(0, "abc\ndef", 5)).toEqual({ line: 1, ch: 1 });
  });

  test("multiple blank lines accounted for", () => {
    // text: "a\n\nb"  → offset 0=a, 1=\n, 2=\n, 3=b
    expect(locateCursor(5, "a\n\nb", 3)).toEqual({ line: 7, ch: 0 });
  });

  test("offset at end of text", () => {
    const text = "abc\ndef";
    expect(locateCursor(0, text, text.length)).toEqual({ line: 1, ch: 3 });
  });

  test("starting line offset is honored", () => {
    expect(locateCursor(10, "x\ny", 2)).toEqual({ line: 11, ch: 0 });
  });
});
