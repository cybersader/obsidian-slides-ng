import { test, expect, describe } from "bun:test";
import { renderDeck, renderDeckStandalone } from "../src/render/renderDeck";

// v0.13.33: reveal scales the whole slide canvas to the window but never
// shrinks content that OVERFLOWS the canvas, so dense slides spill at
// large sizes. The live deck (preview + interactive HTML export) now
// zooms any slide taller than the canvas down to fit. This is a runtime
// behaviour; here we assert the enabling code + attributes are emitted.

describe("auto-fit (live deck)", () => {
  const md = "---\n---\n\n# Slide\n\nBody.\n";

  test("emitted by default in the interactive deck", () => {
    const html = renderDeck(md, "deck.md");
    expect(html).toContain("function slidesNgFitOne");
    expect(html).toContain("slidesNgFitCurrent");
    // hooks reveal's own events, and re-centers via Reveal.layout
    expect(html).toContain("'slidechanged'");
  });

  test("standalone (interactive) export emits it too", () => {
    const html = renderDeckStandalone(md, "deck.md");
    expect(html).toContain("function slidesNgFitOne");
  });

  test("autoFit:false disables it globally", () => {
    const html = renderDeck(md, "deck.md", { autoFit: false });
    expect(html).not.toContain("function slidesNgFitOne");
    expect(html).not.toContain("slidesNgFitCurrent");
  });

  test("print/PDF export does NOT emit the live auto-fit (print has its own fit)", () => {
    const html = renderDeckStandalone(md, "deck.md", { forcePrintMode: true });
    expect(html).not.toContain("function slidesNgFitOne");
  });

  // NB: the emitted JS comment mentions `data-sng-fit="false"`, so these
  // assertions target the attribute on an actual <section> tag, not the
  // raw string anywhere in the document.
  const SECTION_OPT_OUT = /<section[^>]*\bdata-sng-fit="false"/;
  const SECTION_HAS_FIT_ATTR = /<section[^>]*\bdata-sng-fit=/;

  test("per-slide `slides-ng-fit: false` emits data-sng-fit on that section", () => {
    // Slidev per-slide frontmatter block sets the 2nd slide's opt-out.
    const deck =
      "---\n---\n\n# One\n\n---\nslides-ng-fit: false\n---\n\n# Two\n";
    const html = renderDeck(deck, "deck.md");
    expect(html).toMatch(SECTION_OPT_OUT);
  });

  test("a slide with no override gets NO data-sng-fit attribute", () => {
    const html = renderDeck(md, "deck.md");
    expect(html).not.toMatch(SECTION_HAS_FIT_ATTR);
  });

  test("`slides-ng-fit: true` does not emit the opt-out attribute", () => {
    const deck =
      "---\n---\n\n# One\n\n---\nslides-ng-fit: true\n---\n\n# Two\n";
    const html = renderDeck(deck, "deck.md");
    expect(html).not.toMatch(SECTION_HAS_FIT_ATTR);
  });
});
