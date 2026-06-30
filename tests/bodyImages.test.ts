/**
 * v0.13.3: end-to-end coverage that body images render — the actual
 * user-reported bug ("![[image]] embeds not showing up in preview").
 * Renders full decks through renderDeck and asserts resolved <img>
 * tags appear in the slide body HTML (not literal `![[…]]` text).
 */
import { describe, expect, test } from "bun:test";
import { renderDeck } from "../src/render/renderDeck";

/** Extract just the rendered slide body region (excludes bundled CSS). */
function slideRegion(full: string): string {
  const a = full.indexOf('class="slides"');
  const b = a >= 0 ? full.indexOf("<script", a) : -1;
  return a >= 0 && b >= 0 ? full.slice(a, b) : full;
}

const RESOLVE = (p: string): string | null =>
  p.startsWith("http") || p.startsWith("data:") ? p : `app://vault/${p}`;

describe("Obsidian image embeds in slide body", () => {
  test("![[image.png]] becomes a resolved <img>, not literal text", () => {
    const html = renderDeck("# Slide\n\n![[photo.png]]\n", "deck.md", {
      resolveImage: RESOLVE,
    });
    const body = slideRegion(html);
    expect(body).toContain('<img class="slides-ng-embed"');
    expect(body).toContain('src="app://vault/photo.png"');
    expect(body).not.toContain("![[photo.png]]");
  });

  test("sized embed ![[img|320x240]] carries width + height", () => {
    const html = renderDeck("# S\n\n![[photo.png|320x240]]\n", "deck.md", {
      resolveImage: RESOLVE,
    });
    const body = slideRegion(html);
    expect(body).toContain('width="320"');
    expect(body).toContain('height="240"');
  });

  test("embed with caption ![[img|My caption]] sets alt", () => {
    const html = renderDeck("# S\n\n![[photo.png|My caption]]\n", "deck.md", {
      resolveImage: RESOLVE,
    });
    expect(slideRegion(html)).toContain('alt="My caption"');
  });

  test("embed works WITHOUT a resolver (degrades to raw src, still an <img>)", () => {
    const html = renderDeck("# S\n\n![[photo.png]]\n");
    const body = slideRegion(html);
    expect(body).toContain("<img");
    expect(body).toContain('src="photo.png"');
    expect(body).not.toContain("![[");
  });

  test("non-image embed ![[note]] left untouched (no <img>)", () => {
    const html = renderDeck("# S\n\n![[some note]]\n", "deck.md", {
      resolveImage: RESOLVE,
    });
    const body = slideRegion(html);
    expect(body).not.toContain('class="slides-ng-embed"');
  });
});

describe("standard markdown images in slide body", () => {
  test("![](relative.png) src resolved through resolveImage", () => {
    const html = renderDeck("# S\n\n![alt text](assets/pic.png)\n", "deck.md", {
      resolveImage: RESOLVE,
    });
    const body = slideRegion(html);
    expect(body).toContain('src="app://vault/assets/pic.png"');
    expect(body).toContain('alt="alt text"');
    expect(body).not.toContain('src="assets/pic.png"'); // raw path replaced
  });

  test("remote image URL passes through unchanged", () => {
    const html = renderDeck("# S\n\n![x](https://e.com/p.png)\n", "deck.md", {
      resolveImage: RESOLVE,
    });
    expect(slideRegion(html)).toContain('src="https://e.com/p.png"');
  });

  test("unresolved path kept (renderer falls back to raw href)", () => {
    const html = renderDeck("# S\n\n![x](nope.png)\n", "deck.md", {
      resolveImage: () => null,
    });
    expect(slideRegion(html)).toContain('src="nope.png"');
  });
});

describe("embeds compose with layout features", () => {
  test("embed inside a two-column ::left:: slot resolves", () => {
    const md = [
      "---",
      "slides-ng-layout: two-cols",
      "---",
      "",
      "::left::",
      "",
      "![[left.png]]",
      "",
      "::right::",
      "",
      "right text",
      "",
    ].join("\n");
    const html = renderDeck(md, "deck.md", { resolveImage: RESOLVE });
    expect(slideRegion(html)).toContain('src="app://vault/left.png"');
  });

  test("embed inside a fenced div (::: callout) resolves", () => {
    const md = "# S\n\n::: callout\n\n![[inside.png]]\n\n:::\n";
    const html = renderDeck(md, "deck.md", { resolveImage: RESOLVE });
    const body = slideRegion(html);
    expect(body).toContain('class="callout"');
    expect(body).toContain('src="app://vault/inside.png"');
  });

  test("multiple embeds across slides all resolve", () => {
    const md = "# A\n\n![[one.png]]\n\n---\n\n# B\n\n![[two.png]]\n";
    const html = renderDeck(md, "deck.md", { resolveImage: RESOLVE });
    const body = slideRegion(html);
    expect(body).toContain('src="app://vault/one.png"');
    expect(body).toContain('src="app://vault/two.png"');
  });
});

describe("v0.13.3 workflow-confirmed regressions", () => {
  test("element annotation on an ![[img]] embed merges class, no sentinel leak", () => {
    const md = '# S\n\n![[diagram.png]]\n<!-- element class="fragment" -->\n';
    const html = renderDeck(md, "deck.md", { resolveImage: RESOLVE });
    const body = slideRegion(html);
    // class merged onto the img...
    expect(body).toMatch(/<img class="slides-ng-embed fragment"[^>]*src="app:\/\/vault\/diagram\.png"/);
    // ...and absolutely no leftover sentinel garbage on the slide.
    expect(body).not.toContain("SLIDES_NG_ELEMENT_ANNOTATION");
    expect(body).not.toContain("__END__");
  });

  test("embed inside a fenced code block renders literally (no <img>)", () => {
    const md = "# S\n\n```\nUse ![[diagram.png]] to embed\n```\n";
    const html = renderDeck(md, "deck.md", { resolveImage: RESOLVE });
    const body = slideRegion(html);
    expect(body).not.toContain("slides-ng-embed");
    // the literal embed text survives (HTML-escaped inside <code>)
    expect(body).toMatch(/!\[\[diagram\.png\]\]/);
  });

  test("ico/apng embeds are NOT turned into images (Obsidian fidelity)", () => {
    const html = renderDeck("# S\n\n![[favicon.ico]]\n\n![[anim.apng]]\n", "deck.md", {
      resolveImage: RESOLVE,
    });
    expect(slideRegion(html)).not.toContain("slides-ng-embed");
  });
});
