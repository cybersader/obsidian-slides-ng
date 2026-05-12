import { test, expect, describe } from "bun:test";
import { applyLayout } from "../src/render/layouts";
import { renderDeck } from "../src/render/renderDeck";

describe("image layouts — applyLayout", () => {
  test("image-left wraps in cols with image side on the left", () => {
    const html = applyLayout("image-left", {
      default: "<p>content</p>",
      image: '<img src="x.png">',
    });
    expect(html).toContain('data-layout="image-left"');
    expect(html).toContain("slides-ng-image-left");
    expect(html).toContain("slides-ng-image-side");
    expect(html).toContain("<p>content</p>");
    expect(html).toContain('<img src="x.png">');
    // Image side appears before content side.
    expect(html.indexOf("slides-ng-image-side")).toBeLessThan(
      html.indexOf("slides-ng-image-content")
    );
  });

  test("image-right reverses the order (content first, image second)", () => {
    const html = applyLayout("image-right", {
      default: "<p>content</p>",
      image: '<img src="x.png">',
    });
    expect(html).toContain("slides-ng-image-right");
    expect(html.indexOf("slides-ng-image-content")).toBeLessThan(
      html.indexOf("slides-ng-image-side")
    );
  });

  test("image (full-bleed) wraps in slides-ng-image-full with bg + overlay", () => {
    const html = applyLayout("image", {
      default: "<h1>Title</h1>",
      image: '<img src="hero.jpg">',
    });
    expect(html).toContain("slides-ng-image-full");
    expect(html).toContain("slides-ng-image-bg");
    expect(html).toContain("slides-ng-image-overlay");
  });
});

describe("renderDeck — image layout via frontmatter `image:`", () => {
  test("layout: image-left + image: synthesizes the image slot", () => {
    const md = `---
---

---
layout: image-left
image: assets/hero.png
---

# Title

Some content.
`;
    const html = renderDeck(md);
    expect(html).toContain('data-layout="image-left"');
    // The image element should appear with the raw path as src (no
    // resolver supplied in this test).
    expect(html).toContain('src="assets/hero.png"');
    expect(html).toContain('class="slides-ng-image"');
  });

  test("custom resolver gets called and its return value is used", () => {
    const md = `---
---

---
layout: image
image: hero.jpg
---

# Cover
`;
    const calls: string[] = [];
    const html = renderDeck(md, "deck.md", {
      resolveImage: (raw) => {
        calls.push(raw);
        return "data:image/png;base64,RESOLVED";
      },
    });
    expect(calls).toEqual(["hero.jpg"]);
    expect(html).toContain("data:image/png;base64,RESOLVED");
  });

  test("resolver returning null falls back to the raw frontmatter path", () => {
    const md = "---\n---\n\n---\nlayout: image-right\nimage: foo.png\n---\n\n# X\n";
    const html = renderDeck(md, "deck.md", { resolveImage: () => null });
    expect(html).toContain('src="foo.png"');
  });

  test("absolute URL is preserved as-is", () => {
    const md =
      "---\n---\n\n---\nlayout: image\nimage: https://example.com/x.jpg\n---\n\n# X\n";
    const html = renderDeck(md);
    expect(html).toContain('src="https://example.com/x.jpg"');
  });

  test("no `image:` frontmatter → image slot stays empty (graceful)", () => {
    const md = "---\n---\n\n---\nlayout: image-left\n---\n\n# Title\n\nBody.\n";
    const html = renderDeck(md);
    // The image slot div exists but its body is empty (no <img>).
    expect(html).toContain('data-layout="image-left"');
    expect(html).not.toContain("<img");
  });

  test("HTML-attribute-injection chars in image path are escaped", () => {
    const md =
      '---\n---\n\n---\nlayout: image\nimage: a"b&c.png\n---\n\n# X\n';
    const html = renderDeck(md);
    expect(html).toContain("&quot;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain('src="a"b&c');
  });
});
