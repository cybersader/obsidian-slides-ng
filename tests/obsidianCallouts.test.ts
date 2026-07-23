import { test, expect, describe } from "bun:test";
import { renderDeck } from "../src/render/renderDeck";

// v0.13.36: Obsidian native callouts (`> [!type]`) render as
// `.callout[data-callout]` boxes with an Obsidian-compatible DOM. Styling
// is CSS-only (overridable); the extension just emits the structure.

function body(md: string): string {
  // full deck HTML; assertions target the emitted callout markup
  return renderDeck("---\n---\n\n" + md + "\n", "deck.md");
}

describe("obsidian callouts", () => {
  test("`> [!info] Title` + body → callout box with title + content", () => {
    const html = body("> [!info] Heads up\n> the body **text**");
    expect(html).toContain('<div class="callout" data-callout="info"');
    expect(html).toContain('<div class="callout-title">');
    expect(html).toContain('<span class="callout-title-inner">Heads up</span>');
    expect(html).toContain('<div class="callout-content">');
    // body renders as markdown (bold survives)
    expect(html).toMatch(/callout-content">[\s\S]*<strong>text<\/strong>/);
  });

  test("no title → default title is the type, first letter cased", () => {
    const html = body("> [!warning]\n> careful");
    expect(html).toContain('data-callout="warning"');
    expect(html).toContain(">Warning</span>");
  });

  test("type is lowercased in data-callout", () => {
    expect(body("> [!WARNING] x")).toContain('data-callout="warning"');
  });

  test("unknown/custom type still emits data-callout (styleable)", () => {
    const html = body("> [!my-custom] hi");
    expect(html).toContain('data-callout="my-custom"');
  });

  test("fold marker is captured but content still renders (expanded)", () => {
    const html = body("> [!info]- Collapsed by default in Obsidian\n> shown here");
    expect(html).toContain('data-callout="info"');
    expect(html).toContain('data-callout-fold="-"');
    expect(html).toContain("shown here");
  });

  test("ordinary blockquote is NOT turned into a callout", () => {
    const html = body("> just a normal quote\n> second line");
    expect(html).toContain("<blockquote>");
    // NB: the callout CSS (always emitted) mentions data-callout, so assert
    // on the actual callout ELEMENT, not the bare substring.
    expect(html).not.toContain('<div class="callout" data-callout=');
  });

  test("multi-line body keeps markdown structure (list)", () => {
    const html = body("> [!tip] Steps\n> - one\n> - two");
    expect(html).toMatch(/callout-content">[\s\S]*<ul>[\s\S]*<li>one<\/li>/);
  });

  test("a callout with only a title (no body) omits the content block", () => {
    const html = body("> [!note] Solo title");
    expect(html).toContain('<span class="callout-title-inner">Solo title</span>');
    expect(html).not.toContain('<div class="callout-content">');
  });

  test("title is parsed as inline markdown (same trust as the rest of the deck)", () => {
    // Decks already allow raw HTML + markdown everywhere; the title is no
    // different. Inline emphasis renders.
    const html = body("> [!info] a *strong* point\n> body");
    expect(html).toMatch(/callout-title-inner">a <em>strong<\/em> point/);
  });

  test("the data-callout attribute can't be broken out of", () => {
    // A `type` with a quote/space simply doesn't match the callout pattern,
    // so it stays a plain blockquote — the attribute is never injectable.
    const html = body('> [!bad"type] x\n> y');
    expect(html).not.toContain('<div class="callout" data-callout=');
    expect(html).toContain("<blockquote>");
  });

  test("renderObsidianCallouts:false leaves it a plain blockquote", () => {
    const html = renderDeck("---\n---\n\n> [!info] x\n> y\n", "deck.md", {
      renderObsidianCallouts: false,
    });
    expect(html).not.toContain('<div class="callout" data-callout=');
    expect(html).toContain("<blockquote>");
  });

  test("default (setting omitted) renders callouts", () => {
    expect(body("> [!info] on by default")).toContain('data-callout="info"');
  });
});
