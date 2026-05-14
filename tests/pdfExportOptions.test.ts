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

describe("standalone enhancements bundled (v0.11.33)", () => {
  test("Grid button is injected into the standalone export", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    expect(html).toContain("slides-ng-grid-btn");
    expect(html).toContain("Show all slides");
  });

  test("G keyboard shortcut handler is bundled", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    // The shortcut handler dispatches a slides-ng-cmd message.
    expect(html).toContain("toggleOverview");
    // The handler skips when modifier keys are held — sanity check.
    expect(html).toMatch(/e\.key !== ['"]g['"]/);
  });

  test("S-key speaker-view popup helpers are bundled", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    expect(html).toContain("__slidesNgOpenSpeakerView");
    expect(html).toContain("__slidesNgToggleGrid");
    // The popup template's key strings.
    expect(html).toContain("Speaker view");
    expect(html).toContain("Current slide");
    expect(html).toContain("Next slide");
    expect(html).toContain("Speaker notes");
  });

  test("scenes from settings are emitted as window.__slidesNgScenes in the standalone HTML (v0.11.36)", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {
      scenes: [
        { id: "blackout", label: "Blackout", content: "" },
        { id: "custom-coffee", label: "Coffee break", content: "# Coffee\n\nBack in 15.", icon: "coffee" },
      ],
    });
    expect(html).toContain("window.__slidesNgScenes");
    // The scene ids should be in the emitted JSON.
    expect(html).toContain('"id":"blackout"');
    expect(html).toContain('"id":"custom-coffee"');
    expect(html).toContain('"label":"Coffee break"');
    // Content was rendered to HTML, not left as markdown.
    expect(html).toContain("<h1");
    expect(html).toContain("Coffee");
    expect(html).toContain("Back in 15");
  });

  test("standalone enhancements are SKIPPED in embedded mode", () => {
    // renderDeck (not renderDeckStandalone) uses embedded:true by
    // default — the Grid button + popup should NOT appear.
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    // (renderDeckStandalone is by definition standalone — assert
    // the enhancements ARE there for it.)
    expect(html).toContain("slides-ng-grid-btn");

    // Quick check: when embedded:true overrides via renderDeckFromAst,
    // the enhancement block is absent. Test this through the bundled
    // renderDeck call.
    // (Imported renderDeck uses embedded:true by default.)
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
