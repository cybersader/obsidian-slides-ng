import { describe, expect, test } from "bun:test";
import { TEMPLATES } from "../src/templates";

/**
 * v0.12.1: verifies the wrap-mode mechanics work for the snippet
 * registry. The actual Modal class can\'t be unit-tested without
 * Obsidian's Editor instance, so we exercise the underlying string
 * surgery here — same logic the modal performs.
 */
function wrapSnippet(snippetText: string, cursorOffset: number, selection: string): string {
  return snippetText.slice(0, cursorOffset) + selection + snippetText.slice(cursorOffset);
}

describe("snippet wrap-mode (HTML default)", () => {
  test("callout wraps selection at the cursor marker inside the <p>", () => {
    const tpl = TEMPLATES.find((t) => t.name === "callout");
    expect(tpl).toBeDefined();
    const { text, cursorOffset } = tpl!.expand();
    const out = wrapSnippet(text, cursorOffset, "hello world");
    // HTML default emits <p><strong>Note:</strong> █</p>; selection
    // lands at the marker right after "Note:&nbsp;".
    expect(out).toContain("<p><strong>Note:</strong> hello world</p>");
    expect(out.startsWith('<div class="callout">')).toBe(true);
    expect(out.trimEnd().endsWith("</div>")).toBe(true);
  });

  test("twocol wraps selection inside the LEFT column <p>", () => {
    const tpl = TEMPLATES.find((t) => t.name === "twocol");
    expect(tpl).toBeDefined();
    const { text, cursorOffset } = tpl!.expand();
    const out = wrapSnippet(text, cursorOffset, "first slot content");
    // HTML default uses <h2>Left heading</h2> not ## markdown.
    const leftHeadingIdx = out.indexOf("<h2>Left heading</h2>");
    const rightHeadingIdx = out.indexOf("<h2>Right heading</h2>");
    const selIdx = out.indexOf("first slot content");
    expect(leftHeadingIdx).toBeGreaterThan(-1);
    expect(rightHeadingIdx).toBeGreaterThan(-1);
    expect(selIdx).toBeGreaterThan(leftHeadingIdx);
    expect(selIdx).toBeLessThan(rightHeadingIdx);
  });

  test("hero wraps selection inside the <h1>", () => {
    const tpl = TEMPLATES.find((t) => t.name === "hero");
    expect(tpl).toBeDefined();
    const { text, cursorOffset } = tpl!.expand();
    const out = wrapSnippet(text, cursorOffset, "My Big Title");
    expect(out).toContain("<h1>My Big Title</h1>");
    expect(out).toContain("Subtitle goes here");
  });

  test("bignum wraps selection as the big-number <p>", () => {
    const tpl = TEMPLATES.find((t) => t.name === "bignum");
    expect(tpl).toBeDefined();
    const { text, cursorOffset } = tpl!.expand();
    const out = wrapSnippet(text, cursorOffset, "99.9%");
    expect(out).toContain('<div class="bignum">');
    // Number paragraph appears before label paragraph.
    const numIdx = out.indexOf("99.9%");
    const labelIdx = out.indexOf("label / unit");
    expect(numIdx).toBeGreaterThan(-1);
    expect(numIdx).toBeLessThan(labelIdx);
  });

  test("every snippet has a cursor marker so wrap-mode has a target", () => {
    for (const tpl of TEMPLATES) {
      const { text, cursorOffset } = tpl.expand();
      expect(cursorOffset).toBeGreaterThanOrEqual(0);
      expect(cursorOffset).toBeLessThanOrEqual(text.length);
    }
  });
});
