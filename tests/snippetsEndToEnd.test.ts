/**
 * End-to-end render verification for v0.12.0 snippets.
 *
 * Takes each snippet from TEMPLATES, builds a single-slide deck
 * containing its expansion, runs it through the full renderDeck
 * pipeline (parseDeck → marked → fenced-divs extension), and asserts:
 *   1. No render errors thrown.
 *   2. The fenced-div produces a <div class="<expected>"> at the
 *      right place in the output HTML.
 *   3. Inner markdown (headings, paragraphs, lists, code) is actually
 *      parsed as markdown (not raw text).
 *   4. The output HTML doesn\'t contain stray "::: classname" literals
 *      from broken fence parsing.
 */
import { describe, expect, test } from "bun:test";
import { renderDeckStandalone } from "../src/render/renderDeck";
import { TEMPLATES } from "../src/templates";

/**
 * Render a deck and return ONLY the slide body region (so our
 * assertions don\'t false-positive against the bundled stylesheet
 * text, which contains CSS selector mentions like "section .twocol"
 * and references to "::: classname" in comments).
 *
 * Finds the slide via the test "<h1>slide</h1>" marker and slices
 * from there to the closing </section>.
 */
function renderSlide(body: string): string {
  const md = `---\ntitle: test\n---\n\n# slide\n\n${body}\n`;
  const full = renderDeckStandalone(md, "test.md", { defaultTheme: "black" });
  const start = full.indexOf("<h1>slide</h1>");
  if (start < 0) return full;
  const end = full.indexOf("</section>", start);
  if (end < 0) return full.slice(start);
  return full.slice(start, end);
}

/**
 * Build a snippet body with the cursor-marker slot filled in. The
 * snippet\'s expand() already strips the `█` marker, so we inject
 * `content` at the cursorOffset returned by expand() — same logic
 * the insert-modal uses.
 */
function fillSnippet(name: string, content: string): string {
  const tpl = TEMPLATES.find((t) => t.name === name)!;
  const { text, cursorOffset } = tpl.expand();
  return text.slice(0, cursorOffset) + content + text.slice(cursorOffset);
}

describe("snippet end-to-end render", () => {
  test("hero snippet renders <div class=\"hero\"> with H1 inside", () => {
    const body = fillSnippet("hero", "Big Title");
    const html = renderSlide(body);
    expect(html).toContain('<div class="hero">');
    expect(html).toContain("<h1>Big Title</h1>");
    expect(html).toContain("Subtitle goes here");
    expect(html).not.toContain(":::");
  });

  test("twocol snippet renders nested divs with both column headings", () => {
    const body = fillSnippet("twocol", "left body");
    const html = renderSlide(body);
    expect(html).toContain('<div class="twocol">');
    expect(html).toContain("<h2>Left heading</h2>");
    expect(html).toContain("<h2>Right heading</h2>");
    expect(html).toContain("left body");
    expect(html).not.toContain("::: twocol");
    expect(html).not.toContain(":::: { }");
  });

  test("threecol snippet renders 3 inner divs", () => {
    const body = fillSnippet("threecol", "first");
    const html = renderSlide(body);
    expect(html).toContain('<div class="threecol">');
    const innerOpenCount = (html.match(/<div>/g) ?? []).length;
    expect(innerOpenCount).toBeGreaterThanOrEqual(3);
    expect(html).toContain("<h3>One</h3>");
    expect(html).toContain("<h3>Two</h3>");
    expect(html).toContain("<h3>Three</h3>");
    expect(html).toContain("first");
  });

  test("callout snippet renders <div class=\"callout\">", () => {
    const body = fillSnippet("callout", "some note text");
    const html = renderSlide(body);
    expect(html).toContain('<div class="callout">');
    expect(html).toContain("<strong>Note:</strong>");
    expect(html).toContain("some note text");
  });

  test("callout-warn snippet renders both classes", () => {
    const body = fillSnippet("callout-warn", "warning text");
    const html = renderSlide(body);
    expect(html).toMatch(/<div class="callout warn">/);
  });

  test("bignum renders the number paragraph + label paragraph", () => {
    const body = fillSnippet("bignum", "99.9%");
    const html = renderSlide(body);
    expect(html).toContain('<div class="bignum">');
    expect(html).toContain("<p>99.9%</p>");
    expect(html).toContain("<p>label / unit</p>");
  });

  test("stat-grid renders outer + 3 stat-card children", () => {
    const body = fillSnippet("stat-grid", "42");
    const html = renderSlide(body);
    expect(html).toContain('<div class="stat-grid">');
    const matches = html.match(/<div class="stat-card">/g) ?? [];
    expect(matches.length).toBe(3);
    expect(html).toContain("<p>42</p>");
    expect(html).toContain("<p>users</p>");
  });

  test("compare renders compare wrapper + compare-good/bad inner", () => {
    const body = fillSnippet("compare", "fast");
    const html = renderSlide(body);
    expect(html).toContain('<div class="compare">');
    expect(html).toContain('<div class="compare-good">');
    expect(html).toContain('<div class="compare-bad">');
    expect(html).toContain("<h3>Good</h3>");
    expect(html).toContain("<h3>Avoid</h3>");
  });

  test("accent-box renders <div class=\"accent-box\">", () => {
    const body = fillSnippet("accent-box", "Emphasis here");
    const html = renderSlide(body);
    expect(html).toContain('<div class="accent-box">');
    expect(html).toContain("<h1>Emphasis here</h1>");
  });

  test("image-left and image-right are distinct classes", () => {
    const htmlL = renderSlide(fillSnippet("image-left", "img.png"));
    const htmlR = renderSlide(fillSnippet("image-right", "img.png"));
    expect(htmlL).toContain('<div class="image-left">');
    expect(htmlR).toContain('<div class="image-right">');
  });

  test("no snippet leaks raw ::: into output", () => {
    for (const tpl of TEMPLATES) {
      if (!tpl.name.match(/^(hero|twocol|threecol|image-|callout|bignum|stat-grid|compare|accent-box)/)) continue;
      const body = fillSnippet(tpl.name, "x");
      const html = renderSlide(body);
      expect(html).not.toMatch(/:{3,}/);
    }
  });

  test("inner markdown renders properly (no raw asterisks)", () => {
    // Pick a snippet, replace the marker with markdown text, verify
    // the markdown formatting was applied (bold survives).
    const html = renderSlide('::: callout\n\n**bold** and *italic*\n\n:::');
    expect(html).toContain('<div class="callout">');
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  test("code block inside fenced div renders inside <pre>", () => {
    // Shiki needs warmHighlighter() async-warmed for full highlighting;
    // the non-warmed fallback uses plain <pre><code>. Either way the
    // code block must end up INSIDE the fenced-div wrapper.
    const md = '::: callout\n\n```ts\nconst x = 1;\n```\n\n:::';
    const html = renderSlide(md);
    expect(html).toContain('<div class="callout">');
    expect(html).toContain("<pre");
    // Shiki splits tokens across spans; strip tags to check content.
    const textOnly = html.replace(/<[^>]+>/g, "");
    expect(textOnly).toContain("const x = 1");
    // The pre/code must be INSIDE the callout div (callout closes
    // AFTER the pre/code).
    const calloutIdx = html.indexOf('<div class="callout">');
    const preIdx = html.indexOf("<pre", calloutIdx);
    const closeIdx = html.indexOf("</div>", calloutIdx);
    expect(preIdx).toBeGreaterThan(calloutIdx);
    expect(preIdx).toBeLessThan(closeIdx);
  });
});
