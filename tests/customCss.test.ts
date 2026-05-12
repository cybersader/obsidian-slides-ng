/**
 * customCss.test.ts — v0.6.0 unit tests for `customCSS:` deck frontmatter.
 *
 * Verifies sanitization (rejects values containing `<` or `>`) and
 * injection (clean values land in the iframe srcdoc as the final
 * <style> block).
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { renderDeck } from "../src/render/renderDeck";

describe("customCSS frontmatter — sanitization", () => {
  // The headmatter handler calls `console.warn` when it rejects values
  // containing `<` / `>`. Stub it so the test output stays clean and so
  // the warn doesn't leak into other test files via global state.
  const originalWarn = console.warn;
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    console.warn = () => {};
  });
  afterEach(() => {
    console.warn = originalWarn;
  });

  test("plain CSS rules are injected into the iframe", () => {
    const md =
      "---\ncustomCSS: '.reveal { background: navy }'\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain(".reveal { background: navy }");
  });

  test("array of CSS strings concatenates", () => {
    const md =
      "---\ncustomCSS:\n  - '.a { color: red }'\n  - '.b { color: blue }'\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain(".a { color: red }");
    expect(html).toContain(".b { color: blue }");
  });

  test("string containing `<` is rejected (omitted from customCSS block + no payload)", () => {
    const md =
      "---\ncustomCSS: '<script>alert(injection-payload-1)</script>'\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    // The deck has no valid customCSS, so the custom-css <style> block
    // shouldn't be emitted, and the injection payload doesn't appear.
    expect(html).not.toContain("customCSS from deck headmatter");
    expect(html).not.toContain("alert(injection-payload-1)");
  });

  test("string containing `>` is rejected", () => {
    const md = "---\ncustomCSS: 'a > b { x: rejected-payload-2 }'\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).not.toContain("rejected-payload-2");
    expect(html).not.toContain("customCSS from deck headmatter");
  });

  test("mixed array: clean values kept, dirty values rejected", () => {
    const md =
      "---\ncustomCSS:\n  - '.ok { color: green }'\n  - '<style>injected</style>'\n  - '.also-ok { font: bold }'\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain(".ok { color: green }");
    expect(html).toContain(".also-ok { font: bold }");
    expect(html).not.toContain("<style>injected</style>");
  });

  test("undefined customCSS produces no customCSS-style block", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    // The customCSS-marker comment we emit is "customCSS from deck headmatter"
    expect(html).not.toContain("customCSS from deck headmatter");
  });

  test("empty string customCSS produces no customCSS-style block", () => {
    const md = "---\ncustomCSS: ''\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).not.toContain("customCSS from deck headmatter");
  });
});
