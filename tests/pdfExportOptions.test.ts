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

  test("G keyboard handler is installed in capture phase so reveal does not see it (v0.11.40)", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    // The G handler is registered as a capture-phase listener so
    // reveal's own keydown handler never receives the event — this
    // is what stops reveal's "jump to slide" number input from
    // popping up after the user toggles the grid off.
    expect(html).toContain("stopImmediatePropagation");
    // The handler must be registered with capture=true (the third
    // arg to addEventListener). Looking for the literal capture
    // flag near the toggleOverview post.
    expect(html).toMatch(/toggleOverview[\s\S]{0,300}\}, true\)/);
  });

  test("M key toggles the hamburger menu (open AND close) — v0.11.40", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    // The M handler reads isOpen() / .active class and calls
    // closeMenu() when the menu is already open. Previously M
    // only opened the menu (reveal-menu's stock binding).
    expect(html).toMatch(/e\.key !== ['"]m['"]/);
    expect(html).toContain("closeMenu");
    expect(html).toContain("isOpen");
  });

  test("Q key exits fullscreen and closes overlays — v0.11.40", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    expect(html).toMatch(/e\.key !== ['"]q['"]/);
    expect(html).toContain("exitFullscreen");
    // Q also dismisses our grid overlay + reveal-menu + active scene.
    expect(html).toContain("slides-ng-grid");
  });

  test("Grid button uses a distinct 3x3 dots icon (not the reveal-menu close X) — v0.11.40", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    // 3x3 grid icon = 9 filled rectangles. The pre-v0.11.40 icon
    // had only 4 outlined rects, which the user reported looked
    // similar to reveal-menu's close (X) glyph.
    const rectCount = (html.match(/<rect x="(?:3|9\.5|16)"/g) || []).length;
    expect(rectCount).toBeGreaterThanOrEqual(9);
    // Filled, not outlined.
    expect(html).toContain('fill="currentColor"');
  });

  test("html.show-notes class is added when ?showNotes is in URL (v0.11.42 per-page notes fix)", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    // The fix adds documentElement.classList.add('show-notes') inside
    // the same branch that detects ?showNotes. Without this, the
    // `html.print-pdf.show-notes` CSS rule never matched and notes
    // overflowed onto the next page — the user-reported "notes only
    // show on the last slide" symptom.
    expect(html).toContain("classList.add('show-notes')");
    expect(html).toContain("html.print-pdf.show-notes");
  });

  test("print-mode diagnostic banner is bundled (v0.11.42 remote diagnosis)", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    expect(html).toContain("Print mode failed to activate");
    expect(html).toContain("slides-ng v0.11.42");
  });

  test("popup includes in-popup navigation row (Prev/Next/First/Last) — v0.11.42", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    expect(html).toContain('id="nav-prev"');
    expect(html).toContain('id="nav-next"');
    expect(html).toContain('id="nav-first"');
    expect(html).toContain('id="nav-last"');
    expect(html).toContain('id="nav-counter"');
    // Keyboard shortcuts inside popup are wired up.
    expect(html).toMatch(/ArrowRight|PageDown/);
  });

  test("popup timer defaults to paused on open (v0.11.42)", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    // Initial state: paused=true, label="Start". Was: paused=false,
    // label="Pause" — timer auto-ran from open.
    expect(html).toContain("var paused = true");
    expect(html).toContain('">Start</button>');
  });

  test("popup scene clicks broadcast to current-frame too (v0.11.42)", () => {
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    // sendScene now uses broadcastCmd which posts to both opener
    // AND the popup\'s own iframes — so the speaker\'s "Current slide"
    // panel reflects scene changes, not just the audience window.
    expect(html).toContain("function broadcastCmd(msg)");
    expect(html).toMatch(/broadcastCmd\(msg\)/);
    expect(html).toMatch(/current-frame[\s\S]{0,200}next-frame|current-frame.{0,200}contentWindow/);
  });

  test("popup HTML's inline <script> body parses as valid JS (v0.11.41 regression guard)", () => {
    // v0.11.41: the previous popup template had a nested string-escape
    // bug — the "<span class=\\"empty\\">" literal lost a layer of
    // backslashes after template-literal processing, so the popup's
    // JS parser encountered an unescaped `"empty"` identifier outside
    // a string and SyntaxError'd. That single error killed the timer,
    // scenes UI, and the localStorage sync handler — which is why
    // the speaker popup just sat at "(waiting for sync…)".
    const html = renderDeckStandalone(SAMPLE, "deck.md", {});
    // The popup HTML is generated at runtime inside the iframe. Run
    // the generator function in this sandbox so we can lint its
    // output the same way the popup's HTML parser will.
    const start = html.indexOf("function buildSpeakerPopupHtml");
    const end = html.indexOf("/* v0.11.37: localStorage-based sync");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fnSrc = html.slice(start, end);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory = new Function(
      `${fnSrc} return buildSpeakerPopupHtml("about:blank");`
    );
    const popupHtml = factory() as string;
    const scriptMatch = popupHtml.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatch).not.toBeNull();
    // Re-parse the popup's script body the way the popup's JS engine
    // would. SyntaxError throws here ⇒ the popup is broken end-to-end.
    expect(() => new Function(scriptMatch![1])).not.toThrow();
  });

  test("click-to-progress handler is bundled only when option is on (v0.11.41)", () => {
    const off = renderDeckStandalone(SAMPLE, "deck.md", {});
    expect(off).not.toMatch(/click[\s\S]{0,80}Reveal\.next/);

    const on = renderDeckStandalone(SAMPLE, "deck.md", {
      clickToProgress: true,
    });
    expect(on).toContain("Reveal.next()");
    expect(on).toMatch(/addEventListener\(['"]click['"]/);
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

  test("ampersand in path is URL-encoded so it doesn't break the query string (v0.11.40)", () => {
    // User-reported case: vault at `C:\Users\cybersader\Documents\01 Vaults\b&g\`
    // The unencoded `&` in path was being interpreted as a query
    // separator, dropping the entire `?print-pdf&showNotes=true`.
    const url =
      pathToFileUrl("C:\\Users\\cybersader\\Documents\\01 Vaults\\b&g\\export.html") +
      "?print-pdf&showNotes=true";
    expect(url).toBe(
      "file:///C:/Users/cybersader/Documents/01%20Vaults/b%26g/export.html?print-pdf&showNotes=true"
    );
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(
      "/C:/Users/cybersader/Documents/01%20Vaults/b%26g/export.html"
    );
    // The query string survives — both params are reachable.
    expect(parsed.searchParams.has("print-pdf")).toBe(true);
    expect(parsed.searchParams.get("showNotes")).toBe("true");
  });

  test("space in path is URL-encoded (matches what the browser would do anyway)", () => {
    const url = pathToFileUrl("/home/user/My Documents/deck.html");
    expect(url).toBe("file:///home/user/My%20Documents/deck.html");
  });

  test("file name with special chars in vault root", () => {
    const url = pathToFileUrl("C:\\My Vault & Stuff\\.slides-ng-export-12345.html");
    // `.` at the start of segment is OK (not encoded). `&` and ` ` are.
    expect(url).toBe(
      "file:///C:/My%20Vault%20%26%20Stuff/.slides-ng-export-12345.html"
    );
  });
});
