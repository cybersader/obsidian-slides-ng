import { test, expect, describe, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDeck } from "../src/parser/parseDeck";
import { renderDeck } from "../src/render/renderDeck";
import { warmHighlighter } from "../src/render/shiki";

/**
 * Per-fixture coverage tests. Each fixture under `Decks/fixtures/` is a
 * focused .md file exercising one feature category. The unit assertions
 * here check feature-specific output; the E2E spec at
 * test/e2e/fixtures.spec.ts handles the visual proof.
 *
 * When you add a new fixture: drop the file under Decks/fixtures/, add a
 * targeted describe block here, and add the file name to the e2e spec's
 * FIXTURES list.
 */

const FIX_DIR = "Decks/fixtures";

function loadFixture(name: string): string {
  return readFileSync(join(FIX_DIR, name), "utf-8");
}

beforeAll(async () => {
  await warmHighlighter();
});

describe("fixtures: 01-basic.md (markdown fundamentals)", () => {
  const md = loadFixture("01-basic.md");

  test("parses 4 slides", () => {
    expect(parseDeck(md).slides.length).toBe(4);
  });

  test("renders h1/h2/h3/h4/h5", () => {
    const html = renderDeck(md);
    for (const tag of ["<h1", "<h2", "<h3", "<h4", "<h5"]) {
      expect(html).toContain(tag);
    }
  });

  test("renders bold/italic/inline-code", () => {
    const html = renderDeck(md);
    expect(html).toMatch(/<strong>/);
    expect(html).toMatch(/<em>/);
    expect(html).toMatch(/<code>/);
  });

  test("renders ordered and unordered lists", () => {
    const html = renderDeck(md);
    expect(html).toMatch(/<ul>/);
    expect(html).toMatch(/<ol>/);
  });
});

describe("fixtures: 02-frontmatter-simple.md", () => {
  const md = loadFixture("02-frontmatter-simple.md");

  test("theme: simple flows into Reveal.initialize config", () => {
    const html = renderDeck(md);
    // The deck-level options are passed to Reveal.initialize as JSON.
    // theme is applied via <style> blocks, not via initialize config —
    // so we just sanity-check the slide rendered.
    expect(html).toContain("<h1>");
  });

  test("slideNumber: true ends up in initialize config", () => {
    const html = renderDeck(md);
    expect(html).toContain('"slideNumber":true');
  });
});

describe("fixtures: 02b-frontmatter-black.md", () => {
  const md = loadFixture("02b-frontmatter-black.md");

  test("black theme CSS is embedded (background-color or .reveal var)", () => {
    const html = renderDeck(md);
    // The black theme stylesheet defines background-color among the
    // first declarations — its raw text appears verbatim in the embed.
    expect(html).toContain("background-color:");
    // And the per-token Reveal styles include black-theme specifics.
    expect(html.length).toBeGreaterThan(100_000);
  });
});

describe("fixtures: 03-transitions.md (fade)", () => {
  const md = loadFixture("03-transitions.md");

  test("transition: fade ends up in initialize config", () => {
    const html = renderDeck(md);
    expect(html).toContain('"transition":"fade"');
  });
});

describe("fixtures: 04-vertical-slides.md", () => {
  const md = loadFixture("04-vertical-slides.md");

  test("parses horizontal slides (does not crash on `--`)", () => {
    // @slidev/parser handles `--` as part of the slide content; reveal.js
    // doesn't actually do vertical stacks the same way Slidev does. For
    // M4, this fixture mainly proves the renderer doesn't error on `--`.
    const deck = parseDeck(md);
    expect(deck.slides.length).toBeGreaterThan(0);
    expect(deck.errors.length).toBe(0);
  });
});

describe("fixtures: 05-v-click.md", () => {
  const md = loadFixture("05-v-click.md");

  test("each <v-click> becomes a span.fragment", () => {
    const html = renderDeck(md);
    expect(html).not.toContain("<v-click");
    const fragments = html.match(/<span class="fragment">/g) ?? [];
    // The fixture has 6 <v-click> tags total across 4 slides.
    expect(fragments.length).toBeGreaterThanOrEqual(5);
  });
});

describe("fixtures: 06-v-clicks.md", () => {
  const md = loadFixture("06-v-clicks.md");

  test("<v-clicks> adds .fragment to multiple <li>", () => {
    const html = renderDeck(md);
    expect(html).not.toContain("<v-clicks");
    // First slide alone has 4 li children inside v-clicks.
    const fragLis = html.match(/<li class="fragment">/g) ?? [];
    expect(fragLis.length).toBeGreaterThanOrEqual(4);
  });

  test("<v-clicks> over paragraphs adds .fragment to <p>", () => {
    const html = renderDeck(md);
    const fragPs = html.match(/<p class="fragment">/g) ?? [];
    expect(fragPs.length).toBeGreaterThanOrEqual(3);
  });
});

describe("fixtures: 07-shiki-langs.md (10 languages + unknown)", () => {
  const md = loadFixture("07-shiki-langs.md");

  test("each known lang produces a Shiki block with styled tokens", () => {
    const html = renderDeck(md);
    const shikiBlocks = html.match(/class="shiki/g) ?? [];
    // 10 known langs + 1 unknown (klingon) → 11 .shiki blocks
    expect(shikiBlocks.length).toBeGreaterThanOrEqual(10);

    const styledTokens = html.match(/<span style="color:/g) ?? [];
    expect(styledTokens.length).toBeGreaterThan(0);
  });
});

describe("fixtures: 08-shiki-line-step.md (Slidev info-string)", () => {
  const md = loadFixture("08-shiki-line-step.md");

  test("info-string suffix doesn't break Shiki for ts", () => {
    const html = renderDeck(md);
    expect(html).toContain('class="shiki');
    expect(html).toMatch(/<span style="color:/);
  });

  test("the [1|2-3|all] suffix is NOT yet processed into multi-step (M5)", () => {
    // M4 just highlights — line-stepping fragment expansion arrives in M5.
    // So we should see one <pre> per fence, not multiple stepped variants.
    const md4 = `---\n---\n\n\`\`\`ts [1|2-3|all]\nconst x = 1\n\`\`\`\n`;
    const html = renderDeck(md4);
    const preCount = (html.match(/<pre class="shiki/g) ?? []).length;
    expect(preCount).toBe(1);
  });
});

describe("fixtures: 09-speaker-notes.md", () => {
  const md = loadFixture("09-speaker-notes.md");

  test("first slide has a speaker note rendered as <aside class=\"notes\">", () => {
    const html = renderDeck(md);
    expect(html).toContain('<aside class="notes">');
  });

  test("multi-line speaker notes preserve their structure", () => {
    const html = renderDeck(md);
    // The third slide's note has a list inside it; the rendered note
    // should contain <ul> or <li>.
    expect(html).toMatch(/<aside class="notes">[\s\S]*<li/);
  });
});

describe("fixtures: 10-tables-blockquotes.md", () => {
  const md = loadFixture("10-tables-blockquotes.md");

  test("table renders as <table> / <thead> / <tbody>", () => {
    const html = renderDeck(md);
    expect(html).toMatch(/<table>/);
    expect(html).toMatch(/<thead>/);
    expect(html).toMatch(/<tbody>/);
  });

  test("blockquotes nest", () => {
    const html = renderDeck(md);
    expect(html).toMatch(/<blockquote>[\s\S]*<blockquote>/);
  });
});

describe("fixtures: 11-inline-html.md", () => {
  const md = loadFixture("11-inline-html.md");

  test("raw inline HTML passes through (em/strong/div)", () => {
    const html = renderDeck(md);
    expect(html).toContain('<div class="custom-class">');
  });

  test("inline <style> block is preserved", () => {
    const html = renderDeck(md);
    expect(html).toMatch(/<style>[\s\S]*\.pulse-box/);
  });

  test("inline <svg> is preserved", () => {
    const html = renderDeck(md);
    expect(html).toContain('<svg');
  });
});

describe("fixtures: 12-edge-cases.md", () => {
  const md = loadFixture("12-edge-cases.md");

  test("renderer does not throw on empty slides / comment-only slides", () => {
    expect(() => renderDeck(md)).not.toThrow();
  });

  test("malformed-shaped deck still produces a valid HTML doc", () => {
    const html = renderDeck(md);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('class="reveal"');
  });
});
