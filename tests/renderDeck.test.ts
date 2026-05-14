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

  describe("M5 line-stepping", () => {
    test("a ts [1|2-3|all] fence produces 3 stacked step blocks", () => {
      const md = `---
---

\`\`\`ts [1|2-3|all]
const a = 1
const b = 2
const c = 3
\`\`\`
`;
      const html = renderDeck(md);
      expect(html).toContain('class="line-step-container"');
      expect(html).toContain('data-step-count="3"');
      const stepBlocks = html.match(/class="line-step-step/g) ?? [];
      expect(stepBlocks.length).toBe(3);
      // Step 0 has no fragment class; steps 1+ do.
      const fragmentSteps = html.match(/class="line-step-step fragment line-step-fade"/g) ?? [];
      expect(fragmentSteps.length).toBe(2);
    });

    test("step lines not in the range get a line-dim class", () => {
      const md = `---
---

\`\`\`ts [1]
const a = 1
const b = 2
const c = 3
\`\`\`
`;
      const html = renderDeck(md);
      // Step 0 keeps line 1 active, dims 2 and 3.
      const dimMatches = html.match(/line line-dim/g) ?? [];
      expect(dimMatches.length).toBeGreaterThanOrEqual(2);
    });

    test("'all' / '*' step does NOT add dim classes", () => {
      const md = `---
---

\`\`\`ts [all]
const a = 1
const b = 2
\`\`\`
`;
      const html = renderDeck(md);
      // 'all' renders without the dim transformer.
      expect(html).toContain('class="line-step-container"');
      // No dim classes should appear in an 'all' step.
      // (Other lang tests in this file might surface line-dim if they use
      // line-step syntax, so scope this assertion to the single step block.)
      const containerStart = html.indexOf('class="line-step-container"');
      const containerEnd = html.indexOf("</div>", containerStart);
      const segment = html.substring(containerStart, containerEnd);
      expect(segment).not.toContain("line-dim");
    });

    test("slide annotation `<!-- slide data-auto-animate -->` lands on the section tag", () => {
      const md = `---
---

# Slide

<!-- slide data-auto-animate -->

<div data-id="box"></div>
`;
      const html = renderDeck(md);
      // The section tag should now carry the attribute.
      expect(html).toMatch(/<section[^>]*data-auto-animate/);
      // And the marker comment is gone from rendered output.
      expect(html.replace(/[\s\S]*<body>/m, "")).not.toContain("<!-- slide");
    });

    test("element annotation `<!-- element class -->` folds into previous element", () => {
      const md = `---
---

# Slide

A paragraph.
<!-- element class="fragment" -->
`;
      const html = renderDeck(md);
      // marked emits <p>A paragraph.</p>; the annotation should have
      // added class="fragment" to it.
      expect(html).toMatch(/<p class="fragment">A paragraph\.<\/p>/);
    });

    test("plain `ts` fence (no brackets) does NOT trigger line-stepping", () => {
      const md = `---
---

\`\`\`ts
const x = 1
\`\`\`
`;
      const html = renderDeck(md);
      // Check for the DOM tag, not the CSS selector — the iframe's
      // styles always contain `.line-step-container` as a rule.
      expect(html).not.toContain('<div class="line-step-container"');
    });
  });
});

describe("renderDeck — multi-line speaker notes (v0.11.18)", () => {
  test("notes with newlines render with <br> via breaks:true marked", () => {
    const md = [
      "# A",
      "",
      "body",
      "",
      "<!--",
      "line one",
      "line two",
      "-->",
    ].join("\n");
    const html = renderDeck(md);
    // The notes HTML lives in a data-notes attribute on the section.
    // With breaks:true the single \n between lines becomes <br>.
    expect(html).toContain("line one");
    expect(html).toContain("line two");
    expect(html).toContain("<br");
  });

  test("slide body still uses CommonMark single-newline-as-space (no breaks:true regression)", () => {
    const md = [
      "# B",
      "",
      "first line",
      "second line",
    ].join("\n");
    const html = renderDeck(md);
    // The body should NOT contain <br> between the two lines because
    // marked's default joins them with a space inside <p>...</p>.
    // We isolate body by stripping any data-notes attributes (they
    // shouldn't exist here anyway — no <!-- ... --> in this deck).
    expect(html).toContain("first line");
    expect(html).toContain("second line");
    expect(html).not.toContain("first line<br");
  });
});
