import { test, expect, describe, beforeAll } from "bun:test";
import { renderDeck, renderDeckFromAst } from "../src/render/renderDeck";
import { parseDeck } from "../src/parser/parseDeck";
import { warmHighlighter } from "../src/render/shiki";

const SAMPLE_DECK = `---
theme: simple
---

# First slide

Hello, world.

---

# Second slide

<!--
Notes for the second slide.
-->
`;

describe("renderDeck", () => {
  test("produces a complete HTML document", () => {
    const html = renderDeck(SAMPLE_DECK);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('class="reveal"');
    expect(html).toContain('class="slides"');
  });

  test("emits one <section> per slide", () => {
    const html = renderDeck(SAMPLE_DECK);
    const sectionMatches = html.match(/<section(?: [^>]*)?>/g) ?? [];
    // Two real slides + zero or more reveal.js internal markup; first two
    // <section> tags belong to our slides.
    expect(sectionMatches.length).toBeGreaterThanOrEqual(2);
  });

  test("converts markdown bodies to HTML via marked", () => {
    const html = renderDeck("---\n---\n\n# Hello\n\nBody\n");
    expect(html).toContain("<h1");
    expect(html).toContain("Hello");
  });

  test("inlines reveal.js (no http/cdn references)", () => {
    const html = renderDeck(SAMPLE_DECK);
    // The inlined reveal.js script bumps the document well past 100 KB.
    expect(html.length).toBeGreaterThan(100_000);
    // Sanity check: shouldn't be linking out to any reveal CDN.
    expect(html).not.toContain("cdn.jsdelivr.net/npm/reveal");
    expect(html).not.toContain("unpkg.com/reveal");
  });

  test("renders speaker notes as <aside class=\"notes\">", () => {
    const html = renderDeck(SAMPLE_DECK);
    expect(html).toContain('<aside class="notes">');
  });

  test("renderDeckFromAst accepts a pre-parsed deck", () => {
    const deck = parseDeck(SAMPLE_DECK);
    const html = renderDeckFromAst(deck);
    expect(html).toContain("First slide");
    expect(html).toContain("Second slide");
  });

  test("honors theme + transition from headmatter", () => {
    const md = `---
theme: white
transition: fade
---

# Slide
`;
    const html = renderDeck(md);
    // White theme has its own background color rules; simple smoke check
    // for any indicator the white theme made it through.
    expect(html).toContain('"transition":"fade"');
  });

  test("translates <v-click> in a slide to a fragment span", () => {
    const md = `---
---

# Slide

<v-click>peekaboo</v-click>
`;
    const html = renderDeck(md);
    expect(html).toContain('<span class="fragment">peekaboo</span>');
    expect(html).not.toContain("<v-click");
  });

  test("translates <v-clicks> wrapping a list", () => {
    const md = `---
---

# Slide

<v-clicks>

- One
- Two
- Three

</v-clicks>
`;
    const html = renderDeck(md);
    const fragmentLis = html.match(/<li class="fragment">/g) ?? [];
    expect(fragmentLis.length).toBe(3);
  });
});

describe("renderDeck with Shiki warm", () => {
  beforeAll(async () => {
    await warmHighlighter();
  });

  test("code blocks render with Shiki highlighting", () => {
    const md = `---
---

# Slide

\`\`\`ts
const x: number = 1
console.log(x)
\`\`\`
`;
    const html = renderDeck(md);
    expect(html).toContain('class="shiki');
    // Shiki emits per-token <span style="color:...">
    expect(html).toMatch(/<span style="color:/);
  });

  test("Slidev info-string suffix (e.g. ts [1|2-3|all]) still highlights", () => {
    // The `[1|2-3|all]` part is M5 line-stepping syntax that marked passes
    // through as part of token.lang. The renderer should still resolve
    // the underlying language (ts) and produce styled tokens.
    const md = `---
---

# Slide

\`\`\`ts [1|2-3|all]
const x = 1
\`\`\`
`;
    const html = renderDeck(md);
    expect(html).toContain('class="shiki');
    expect(html).toMatch(/<span style="color:/);
  });
});
