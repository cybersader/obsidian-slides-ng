import { test, expect, describe } from "bun:test";
import {
  parseAttrString,
  extractSlideAttrs,
  applyElementAnnotations,
  mergeOpenTag,
  renderAttrs,
} from "../src/parser/annotations";

describe("parseAttrString", () => {
  test("quoted, bare, and double-quoted values", () => {
    const a = parseAttrString('class="hero big" style="color: red" data-auto-animate');
    expect(a.class).toBe("hero big");
    expect(a.style).toBe("color: red");
    expect(a["data-auto-animate"]).toBe("");
  });

  test("single quotes work too", () => {
    const a = parseAttrString("class='hero' data-id='box'");
    expect(a.class).toBe("hero");
    expect(a["data-id"]).toBe("box");
  });

  test("bare values without quotes", () => {
    const a = parseAttrString("id=mybox width=200");
    expect(a.id).toBe("mybox");
    expect(a.width).toBe("200");
  });

  test("empty input returns empty map", () => {
    expect(parseAttrString("")).toEqual({});
  });
});

describe("extractSlideAttrs", () => {
  test("removes `<!-- slide ... -->` from content and returns the attrs", () => {
    const input = "# Title\n\n<!-- slide data-auto-animate -->\n\n<div>x</div>";
    const { content, attrs } = extractSlideAttrs(input);
    expect(content).toContain("# Title");
    expect(content).toContain("<div>x</div>");
    expect(content).not.toContain("<!-- slide");
    expect(attrs["data-auto-animate"]).toBe("");
  });

  test("multiple slide annotations are merged left-to-right", () => {
    const input =
      "<!-- slide class=a -->\n\n<!-- slide class=b data-id=box -->\n\nbody";
    const { attrs } = extractSlideAttrs(input);
    // Later wins on class (no merge for slide-level attrs by design;
    // authors who want both should put them in one annotation).
    expect(attrs.class).toBe("b");
    expect(attrs["data-id"]).toBe("box");
  });

  test("no annotation → empty attrs, unchanged content", () => {
    const input = "# Plain\n\nNo annotations.";
    const { content, attrs } = extractSlideAttrs(input);
    expect(attrs).toEqual({});
    expect(content).toBe("# Plain\n\nNo annotations.");
  });
});

describe("mergeOpenTag", () => {
  test("adds new attrs", () => {
    const out = mergeOpenTag("<p>", { class: "fragment" });
    expect(out).toBe('<p class="fragment">');
  });

  test("concatenates class values", () => {
    const out = mergeOpenTag('<p class="existing">', { class: "fragment" });
    expect(out).toBe('<p class="existing fragment">');
  });

  test("concatenates style values with separator", () => {
    const out = mergeOpenTag('<p style="color:red">', {
      style: "background:blue",
    });
    expect(out).toContain("color:red");
    expect(out).toContain("background:blue");
  });

  test("overwrites non-class/style attributes", () => {
    const out = mergeOpenTag('<a href="x">', { href: "y" });
    expect(out).toBe('<a href="y">');
  });

  test("bare attribute renders without value", () => {
    const out = mergeOpenTag("<section>", { "data-auto-animate": "" });
    expect(out).toBe("<section data-auto-animate>");
  });
});

describe("renderAttrs", () => {
  test("produces a space-separated attr string", () => {
    const s = renderAttrs({ class: "a", "data-id": "box" });
    expect(s).toContain('class="a"');
    expect(s).toContain('data-id="box"');
  });

  test("bare attrs render as just the key", () => {
    const s = renderAttrs({ "data-auto-animate": "" });
    expect(s).toBe("data-auto-animate");
  });
});

describe("parseAttrString — edge cases", () => {
  test("attribute with hyphens, dots, colons (custom data-* attrs)", () => {
    const a = parseAttrString('data-step-index="3" xml:lang="en"');
    expect(a["data-step-index"]).toBe("3");
    expect(a["xml:lang"]).toBe("en");
  });

  test("multiple bare attributes", () => {
    const a = parseAttrString("autoplay muted loop");
    expect(a.autoplay).toBe("");
    expect(a.muted).toBe("");
    expect(a.loop).toBe("");
  });

  test("mix of quoted and bare on same line", () => {
    const a = parseAttrString('id=hero class="big bold" data-auto-animate');
    expect(a.id).toBe("hero");
    expect(a.class).toBe("big bold");
    expect(a["data-auto-animate"]).toBe("");
  });

  test("value with embedded special chars (commas, parens)", () => {
    const a = parseAttrString('style="background: rgb(255, 0, 0)"');
    expect(a.style).toBe("background: rgb(255, 0, 0)");
  });

  test("whitespace between tokens is tolerated", () => {
    const a = parseAttrString("   class=foo     id=bar   ");
    expect(a.class).toBe("foo");
    expect(a.id).toBe("bar");
  });
});

describe("extractSlideAttrs — edge cases", () => {
  test("trailing whitespace and blank lines around the marker are absorbed", () => {
    const input = "# Title\n\n\n<!-- slide class=hero -->\n\n\nBody.";
    const { content, attrs } = extractSlideAttrs(input);
    expect(attrs.class).toBe("hero");
    expect(content).toBe("# Title\n\nBody.");
  });

  test("marker mid-paragraph still gets pulled (lenient)", () => {
    const input = "A paragraph <!-- slide id=mid --> with marker.";
    const { content, attrs } = extractSlideAttrs(input);
    expect(attrs.id).toBe("mid");
    // The marker is stripped — content reads more cleanly.
    expect(content).not.toContain("<!-- slide");
  });

  test("annotation with no attrs is rejected (lenient parser)", () => {
    // `<!-- slide -->` with nothing inside is not a useful annotation;
    // our regex requires `<!--\s*slide\s+([^-]...)\s*-->` so a bare
    // marker stays in the content and is treated as a regular comment.
    const input = "Hello\n\n<!-- slide -->\n\nworld";
    const { attrs } = extractSlideAttrs(input);
    expect(Object.keys(attrs).length).toBe(0);
  });

  test("non-slide HTML comments stay put", () => {
    const input = "# Title\n\n<!-- TODO: rewrite this -->\n\nBody.";
    const { content } = extractSlideAttrs(input);
    expect(content).toContain("<!-- TODO:");
  });
});

describe("applyElementAnnotations — edge cases", () => {
  test("after a <li>", () => {
    const html = '<ul><li>one</li>\n<!-- element class="fragment" -->\n<li>two</li></ul>';
    const out = applyElementAnnotations(html);
    expect(out).toContain('<li class="fragment">one</li>');
    expect(out).toContain("<li>two</li>");
  });

  test("after an <h2> heading", () => {
    const html = '<h2>Title</h2>\n<!-- element data-id=hero -->';
    const out = applyElementAnnotations(html);
    expect(out).toMatch(/<h2 data-id="hero">Title<\/h2>/);
  });

  test("after a <pre> code block", () => {
    const html = '<pre><code>x</code></pre>\n<!-- element class="dim" -->';
    const out = applyElementAnnotations(html);
    expect(out).toContain('<pre class="dim"><code>x</code></pre>');
  });

  test("multiple stacked annotations apply to the same element (merge)", () => {
    // Two annotations in a row — both should apply to the previous <p>.
    // Note: only the most-recent CLOSED element is targeted; the second
    // annotation effectively targets the already-updated paragraph.
    const html =
      '<p>hi</p>\n<!-- element class="a" -->\n<!-- element data-id="x" -->';
    const out = applyElementAnnotations(html);
    expect(out).toContain('class="a"');
    expect(out).toContain('data-id="x"');
  });

  test("marker with no preceding element is left alone (no crash)", () => {
    const html = '<!-- element class="orphan" -->\n<p>after</p>';
    const out = applyElementAnnotations(html);
    // Renderer doesn't crash; marker may or may not survive (impl
    // detail) but the <p> below is unchanged.
    expect(out).toContain("<p>after</p>");
  });

  test("element annotations across nested elements", () => {
    const html =
      '<blockquote><p>q</p></blockquote>\n<!-- element class="quote-fragment" -->';
    const out = applyElementAnnotations(html);
    // Annotation should attach to the outer blockquote, not the inner <p>.
    expect(out).toMatch(/<blockquote class="quote-fragment">/);
  });
});

describe("renderDeck integration — annotations × layouts", () => {
  test("slide annotation works inside a two-cols slide", async () => {
    // (importing renderDeck inside the test to avoid circular setup)
    const { renderDeck } = await import("../src/render/renderDeck");
    const md = `---
---

---
layout: two-cols
---

# Title

<!-- slide class="custom-two-cols" -->

::left::

Left.

::right::

Right.
`;
    const html = renderDeck(md);
    expect(html).toMatch(/<section[^>]*class="custom-two-cols"/);
    expect(html).toContain('class="slides-ng-cols-2"');
  });

  test("element annotation inside ::left:: applies to that slot", async () => {
    const { renderDeck } = await import("../src/render/renderDeck");
    const md = `---
---

---
layout: two-cols
---

::left::

Left para.
<!-- element class="fragment" -->

::right::

Right.
`;
    const html = renderDeck(md);
    // Find the left column and verify .fragment is inside it.
    const leftStart = html.indexOf("slides-ng-col-left");
    const leftEnd = html.indexOf("slides-ng-col-right");
    const leftSegment = html.substring(leftStart, leftEnd);
    expect(leftSegment).toContain('class="fragment"');
    // Right column should NOT have a .fragment.
    const rightStart = leftEnd;
    const rightSegment = html.substring(rightStart, rightStart + 500);
    expect(rightSegment).not.toContain('class="fragment"');
  });

  test("real speaker note (free text) is preserved as <aside>", async () => {
    const { renderDeck } = await import("../src/render/renderDeck");
    const md = `---
---

# Slide

Body.

<!--
Speaker notes go here. Not a slide annotation, not an element annotation.
-->
`;
    const html = renderDeck(md);
    expect(html).toContain('<aside class="notes">');
    expect(html).toContain("Speaker notes");
  });

  test("trailing element annotation (parser misclassifies as note) is recovered", async () => {
    const { renderDeck } = await import("../src/render/renderDeck");
    const md = `---
---

# Slide

A paragraph.
<!-- element class="fragment" -->
`;
    const html = renderDeck(md);
    expect(html).toMatch(/<p class="fragment">A paragraph\.<\/p>/);
    // And the comment must NOT have ended up as a speaker note.
    const bodyStart = html.indexOf("Slide</h1>");
    const bodyEnd = html.indexOf("</section>", bodyStart);
    const slideBody = html.substring(bodyStart, bodyEnd);
    expect(slideBody).not.toContain("element class");
  });

  test("trailing slide annotation (parser misclassifies as note) is recovered", async () => {
    const { renderDeck } = await import("../src/render/renderDeck");
    const md = `---
---

# Slide

Body.

<!-- slide data-auto-animate -->
`;
    const html = renderDeck(md);
    expect(html).toMatch(/<section[^>]*data-auto-animate/);
  });
});

describe("applyElementAnnotations", () => {
  test("merges element annotation into the previous <p>", () => {
    const html = '<p>hello</p>\n<!-- element class="fragment" -->\n';
    const out = applyElementAnnotations(html);
    expect(out).toContain('<p class="fragment">hello</p>');
    expect(out).not.toContain("<!-- element");
  });

  test("merges into previous block-level element", () => {
    const html = '<blockquote>q</blockquote>\n<!-- element style="font-size:2em" -->\n';
    const out = applyElementAnnotations(html);
    expect(out).toMatch(/<blockquote style="font-size:2em">q<\/blockquote>/);
  });

  test("class is concatenated with existing class", () => {
    const html = '<p class="lead">hello</p>\n<!-- element class="fragment" -->';
    const out = applyElementAnnotations(html);
    expect(out).toContain('<p class="lead fragment">hello</p>');
  });

  test("no annotation → unchanged HTML", () => {
    const html = "<p>plain</p>";
    expect(applyElementAnnotations(html)).toBe(html);
  });

  test("multiple element annotations on successive paragraphs", () => {
    const html =
      '<p>one</p>\n<!-- element class="fragment" -->\n<p>two</p>\n<!-- element class="fragment fade-in" -->';
    const out = applyElementAnnotations(html);
    expect(out).toContain('<p class="fragment">one</p>');
    expect(out).toContain('<p class="fragment fade-in">two</p>');
  });
});
