import { test, expect, describe } from "bun:test";
import { renderDeck } from "../src/render/renderDeck";

const DECK = `# Hello\n\nworld\n\n---\n\n# Two`;

describe("embedded preview must not be silently broken (v0.11.46+ black-screen guard)", () => {
  test("every <script> in embedded HTML parses as valid JS", () => {
    const html = renderDeck(DECK, "deck.md", {});
    const scriptRe = /<script>([\s\S]*?)<\/script>/g;
    let scripts = 0;
    let m: RegExpExecArray | null;
    while ((m = scriptRe.exec(html)) !== null) {
      scripts++;
      const body = m[1];
      // SyntaxError here would mean the iframe never initialises reveal
      // → empty black slide pane.
      expect(() => new Function(body)).not.toThrow();
    }
    expect(scripts).toBeGreaterThan(0);
  });

  test("embedded HTML does NOT bake print-pdf mode into init", () => {
    const html = renderDeck(DECK, "deck.md", {});
    // The forcePrintMode block sets view: 'print' which collapses
    // reveal into print mode (no animations, no overview, layout
    // changes). Must NEVER appear in embedded preview.
    expect(html).not.toContain("initOpts.view = 'print'");
    expect(html).not.toContain("classList.add('print-pdf')");
    expect(html).not.toContain("classList.add('reveal-print')");
  });

  test("embedded HTML actually contains a Reveal.initialize call", () => {
    const html = renderDeck(DECK, "deck.md", {});
    expect(html).toContain("Reveal.initialize");
  });

  test("embedded HTML contains the slide DOM (sections under .reveal .slides)", () => {
    const html = renderDeck(DECK, "deck.md", {});
    // If slides aren't in the DOM, reveal has nothing to render →
    // black pane.
    expect(html).toMatch(/<div class="reveal">\s*<div class="slides">/);
    expect(html).toMatch(/<section[\s\S]+?<\/section>/);
    // Both slides ended up in there.
    expect(html).toContain("Hello");
    expect(html).toContain("Two");
  });

  test("embedded HTML does NOT emit OUR @page rule (reveal's own is fine)", () => {
    const html = renderDeck(DECK, "deck.md", {});
    // Reveal.js core has an inline `l("@page{...")` print-plugin
    // call that synthesizes a print stylesheet at print-time. That
    // doesn't affect on-screen rendering. We just need to make
    // sure WE don't emit a top-level `@page {` literal — which
    // would come from v0.11.46's pageSize / pageMargin leaking
    // out of the !embedded gate.
    expect(html).not.toMatch(/@page \{\s*\n\s*(size:|margin:)/);
  });

  test("embedded HTML does NOT inject the standalone Grid button / S-key popup script", () => {
    const html = renderDeck(DECK, "deck.md", {});
    // These are standalone-only. Their presence in embedded mode
    // wouldn\'t black-screen the deck but signals a !embedded gate
    // is broken — worth catching.
    expect(html).not.toContain("setupStandaloneEnhancements");
    expect(html).not.toContain("buildSpeakerPopupHtml");
  });

  test("embedded HTML body / .reveal element are NOT display:none", () => {
    const html = renderDeck(DECK, "deck.md", {});
    // Defensive: catch any rule that would visually black the
    // viewport. The `.reveal` element starts with display:none in
    // reveal\'s default CSS and is flipped to flex when ready —
    // but we shouldn\'t have any blanket rule overriding that.
    expect(html).not.toMatch(/body\s*\{[^}]*display:\s*none/);
    expect(html).not.toMatch(/\.reveal\s*\{[^}]*display:\s*none\s*!important/);
  });
});
