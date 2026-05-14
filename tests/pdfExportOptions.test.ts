import { test, expect, describe } from "bun:test";
import { renderDeckStandalone } from "../src/render/renderDeck";
import { buildPdfUrlSuffix, pathToFileUrl } from "../src/export/exportStandalone";

const SAMPLE = `---
theme: simple
---

# Slide 1

Hello

<!-- A note that should appear with showNotes -->

---

# Slide 2
`;

describe("PDF export options actually reach the rendered HTML", () => {
  test("aspectRatio 16:9 sets Reveal width=1280 height=720", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {
      pdfAspectWidth: 1280,
      pdfAspectHeight: 720,
    });
    expect(html).toContain('"width":1280');
    expect(html).toContain('"height":720');
  });

  test("aspectRatio 4:3 sets Reveal width=1024 height=768", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {
      pdfAspectWidth: 1024,
      pdfAspectHeight: 768,
    });
    expect(html).toContain('"width":1024');
    expect(html).toContain('"height":768');
  });

  test("showNotes=true is encoded in the URL suffix", () => {
    const suffix = buildPdfUrlSuffix({ showNotes: true });
    expect(suffix).toContain("showNotes=true");
    expect(suffix).toContain("print-pdf");
  });

  test("aspectRatio default does NOT set width/height (uses reveal default 960/700)", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    expect(html).not.toContain('"width":1280');
    expect(html).not.toContain('"width":1024');
  });

  test("speaker notes <aside class=notes> is rendered into exported HTML (the showNotes URL flag is what tells reveal to display them at print time)", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    expect(html).toContain('class="notes"');
    expect(html).toContain("A note that should appear");
  });

  test("hamburger menu CSS + plugin code is in the exported HTML", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    // reveal-menu plugin (the hamburger). Different builds expose
    // different artefacts; check for the most reliable ones.
    expect(html).toContain("slide-menu-button");
    // The init block configures the menu plugin (we set side, width,
    // titleSelector etc. in revealTemplate.ts).
    expect(html).toContain('"menu":');
    // The actual plugin code (UMD attaches to window.RevealMenu).
    expect(html).toContain("RevealMenu");
  });
});

describe("pathToFileUrl — Windows vs Unix", () => {
  test("Windows path C:\\Users\\foo\\export.html becomes file:///C:/Users/foo/export.html", () => {
    expect(pathToFileUrl("C:\\Users\\foo\\export.html")).toBe(
      "file:///C:/Users/foo/export.html"
    );
  });

  test("Windows path with mixed separators normalises to forward slashes", () => {
    expect(pathToFileUrl("C:\\Users/foo\\bar.html")).toBe(
      "file:///C:/Users/foo/bar.html"
    );
  });

  test("Unix path /home/user/export.html becomes file:///home/user/export.html", () => {
    expect(pathToFileUrl("/home/user/export.html")).toBe(
      "file:///home/user/export.html"
    );
  });

  test("query suffix can be safely appended to the file URL on Windows", () => {
    const url = pathToFileUrl("C:\\Users\\foo\\export.html") + "?print-pdf";
    // file:///C:/... ?print-pdf — valid URL where the query string
    // sits after the path. The pre-fix path produced
    // `file://C:\Users\foo\export.html?print-pdf` which is malformed
    // and most browsers drop the query string.
    expect(url).toBe("file:///C:/Users/foo/export.html?print-pdf");
    // Sanity: the new URL constructor should parse it.
    const parsed = new URL(url);
    expect(parsed.search).toBe("?print-pdf");
  });
});
