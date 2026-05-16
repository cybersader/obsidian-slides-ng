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

describe("snippet wrap-mode", () => {
  test("callout wraps selection at the cursor marker", () => {
    const tpl = TEMPLATES.find((t) => t.name === "callout");
    expect(tpl).toBeDefined();
    const { text, cursorOffset } = tpl!.expand();
    const out = wrapSnippet(text, cursorOffset, "hello world");
    expect(out).toContain("**Note:** hello world");
    expect(out.startsWith("::: callout")).toBe(true);
    expect(out.trimEnd().endsWith(":::")).toBe(true);
  });

  test("twocol wraps selection in the FIRST slot (where marker lives)", () => {
    const tpl = TEMPLATES.find((t) => t.name === "twocol");
    expect(tpl).toBeDefined();
    const { text, cursorOffset } = tpl!.expand();
    const out = wrapSnippet(text, cursorOffset, "first slot content");
    // The selection should be inside the left column (first ::::-fenced child).
    const leftHeadingIdx = out.indexOf("## Left heading");
    const rightHeadingIdx = out.indexOf("## Right heading");
    const selIdx = out.indexOf("first slot content");
    expect(leftHeadingIdx).toBeGreaterThan(-1);
    expect(rightHeadingIdx).toBeGreaterThan(-1);
    expect(selIdx).toBeGreaterThan(leftHeadingIdx);
    expect(selIdx).toBeLessThan(rightHeadingIdx);
  });

  test("hero wraps selection inside the H1", () => {
    const tpl = TEMPLATES.find((t) => t.name === "hero");
    expect(tpl).toBeDefined();
    const { text, cursorOffset } = tpl!.expand();
    const out = wrapSnippet(text, cursorOffset, "My Big Title");
    expect(out).toContain("# My Big Title");
    expect(out).toContain("Subtitle goes here");
  });

  test("bignum wraps selection as the big number", () => {
    const tpl = TEMPLATES.find((t) => t.name === "bignum");
    expect(tpl).toBeDefined();
    const { text, cursorOffset } = tpl!.expand();
    const out = wrapSnippet(text, cursorOffset, "99.9%");
    expect(out).toContain("::: bignum");
    // Number should appear before the label.
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
