import { describe, expect, test } from "bun:test";
import { renderDeck, renderDeckStandalone } from "../src/render/renderDeck";

/**
 * Regressions for the 4 gaps found by the CSS/styling coverage-matrix
 * workflow (v0.13.14): two </script>-breakout injections, an unresolved
 * background url() in a slide-annotation style, and a double-escaped
 * markdown-image alt.
 */

// Resolve any local ref to a data URI; pass http/data through.
const R = (p: string): string | null =>
  /^(https?:|data:)/.test(p) ? p : "data:image/png;base64,OK";

describe("</script> injection is neutralised in inline <script> config", () => {
  test("slides-ng-reveal-config string value can't close the script element", () => {
    const md = [
      "---",
      "slides-ng-reveal-config:",
      "  evil: \"</script><img src=x onerror=alert(1)>\"",
      "---",
      "",
      "# Slide",
    ].join("\n");
    const html = renderDeck(md);
    // The raw closing tag must NOT appear (it would break out of <script>).
    expect(html).not.toContain("</script><img src=x onerror=alert(1)>");
    // It survives as an escaped code point inside the JS string.
    expect(html).toContain("\\u003c/script>");
  });

  test("PDF header/footer text can't close the script element", () => {
    const html = renderDeckStandalone("# S", "deck.md", {
      forcePrintMode: true,
      forceHeaderText: "</script><img src=x onerror=alert(2)>",
      forceFooterText: "safe footer",
    });
    expect(html).not.toContain("</script><img src=x onerror=alert(2)>");
    expect(html).toContain("\\u003c/script>");
  });
});

describe("slide-annotation background url() is inlined", () => {
  test("<!-- slide style=\"background:url(...)\" --> resolves to a data URI", () => {
    const md =
      "<!-- slide style=\"background:url('tile.png') repeat\" -->\n# Slide";
    const html = renderDeck(md, "deck.md", { resolveImage: R });
    expect(html).toContain("url(data:image/png;base64,OK)");
    expect(html).not.toContain("url('tile.png')");
  });

  test("preview and export inline the annotation background identically", () => {
    const md = "<!-- slide style=\"background:url(bg.png)\" -->\n# S";
    const prev = renderDeck(md, "deck.md", { resolveImage: R });
    const exp = renderDeckStandalone(md, "deck.md", { resolveImage: R });
    for (const h of [prev, exp]) {
      expect(h).toContain("url(data:image/png;base64,OK)");
      expect(h).not.toContain("url(bg.png)");
    }
  });
});

describe("markdown-image alt is single-escaped (not double)", () => {
  test("& in alt becomes &amp;, not &amp;amp;", () => {
    const html = renderDeck("![Tom & Jerry](a.png)", "deck.md", {
      resolveImage: R,
    });
    expect(html).toContain('alt="Tom &amp; Jerry"');
    expect(html).not.toContain("&amp;amp;");
  });

  test("quotes/angle brackets in alt are escaped exactly once", () => {
    const html = renderDeck('![a "q" <b>](a.png)', "deck.md", {
      resolveImage: R,
    });
    // one level of escaping — no doubled entities
    expect(html).not.toContain("&amp;quot;");
    expect(html).not.toContain("&amp;lt;");
  });
});
