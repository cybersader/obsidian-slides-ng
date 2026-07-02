import { test, expect, describe } from "bun:test";
import {
  buildExportFilename,
  buildPdfUrlSuffix,
  buildPortableHtmlFilename,
  buildPortableDeckHtml,
  exportDeckToFile,
  exportPortableHtmlWithPrompt,
} from "../src/export/exportStandalone";
import { renderDeckStandalone, renderDeck } from "../src/render/renderDeck";

describe("buildExportFilename", () => {
  test("uses the given timestamp", () => {
    expect(buildExportFilename(1234567890)).toBe(".slides-ng-export-1234567890.html");
  });

  test("each call with a different timestamp produces a different name", () => {
    expect(buildExportFilename(1)).not.toBe(buildExportFilename(2));
  });

  test("includes a sanitized deck name when provided (v0.13.22)", () => {
    expect(buildExportFilename(9, "Q2 Report")).toBe(".slides-ng-export-Q2 Report-9.html");
    expect(buildExportFilename(9, 'we/ird:na*me?"x"')).toBe(".slides-ng-export-we-ird-na-me-x-9.html");
    // both gitignore patterns still match the slugged form
    expect(buildExportFilename(9, "Deck")).toMatch(/^\.slides-ng-export-.*\.html$/);
  });
});

describe("renderDeckStandalone vs renderDeck", () => {
  const md = "---\n---\n\n# Slide\n";

  test("standalone has embedded:false in Reveal.initialize", () => {
    const html = renderDeckStandalone(md);
    expect(html).toContain('"embedded":false');
  });

  test("embedded (default) keeps embedded:true", () => {
    const html = renderDeck(md);
    expect(html).toContain('"embedded":true');
  });

  test("standalone enables controls + progress", () => {
    const html = renderDeckStandalone(md);
    expect(html).toContain('"controls":true');
    expect(html).toContain('"progress":true');
  });

  test("embedded hides controls + progress", () => {
    const html = renderDeck(md);
    expect(html).toContain('"controls":false');
    expect(html).toContain('"progress":false');
  });

  test("standalone HTML is still self-contained (no network refs)", () => {
    const html = renderDeckStandalone(md);
    expect(html).not.toMatch(/https?:\/\/cdn/);
    expect(html).not.toMatch(/https?:\/\/unpkg/);
    expect(html).not.toMatch(/localhost/);
    // Reveal.js + theme CSS must still be inlined.
    expect(html.length).toBeGreaterThan(100_000);
  });
});

// Minimal in-memory mock of the bits of `app` exportDeckToFile uses.
// Keeps the unit test free of obsidian-runtime dependencies.
class MockAdapter {
  written: Map<string, string> = new Map();
  basePath: string;
  constructor(basePath = "/vault") {
    this.basePath = basePath;
  }
  async write(path: string, content: string): Promise<void> {
    this.written.set(path, content);
  }
  getFullPath(path: string): string {
    return `${this.basePath}/${path}`;
  }
}

class MockApp {
  vault = {
    adapter: new MockAdapter(),
    read: async (_file: unknown) => "---\n---\n\n# Title\n\nBody.\n",
  };
}

describe("buildPortableHtmlFilename (v0.13.31)", () => {
  test("is a clean deck-named .html — no dot prefix, no timestamp", () => {
    expect(buildPortableHtmlFilename("Q2 Security Update")).toBe(
      "Q2 Security Update.html"
    );
    expect(buildPortableHtmlFilename("deck.md")).toBe("deck.html");
  });

  test("sanitizes filesystem-unsafe characters", () => {
    expect(buildPortableHtmlFilename('we/ird:na*me?"x"')).toBe("we-ird-na-me-x.html");
  });

  test("falls back to 'deck' when the name is empty/all-unsafe", () => {
    expect(buildPortableHtmlFilename("")).toBe("deck.html");
    expect(buildPortableHtmlFilename("///")).toBe("deck.html");
    expect(buildPortableHtmlFilename(undefined)).toBe("deck.html");
  });

  test("does NOT match the transient-export gitignore patterns", () => {
    // Portable exports are deck-named, so they are intentionally NOT
    // caught by `.slides-ng-export-*` / `slides-ng-export-*` rules.
    expect(buildPortableHtmlFilename("Deck")).not.toMatch(/slides-ng-export-/);
  });
});

describe("buildPortableDeckHtml (v0.13.31)", () => {
  function htmlApp(md: string): Parameters<typeof buildPortableDeckHtml>[0] {
    return {
      vault: {
        async read() {
          return md;
        },
        adapter: { async readBinary() { throw new Error("no img"); } },
      },
      metadataCache: { getFirstLinkpathDest: () => null },
    } as unknown as Parameters<typeof buildPortableDeckHtml>[0];
  }

  test("returns self-contained interactive HTML + a deck-named suggestion", async () => {
    const app = htmlApp("---\n---\n\n# Title\n\nBody.\n");
    const file = { path: "Decks/My Talk.md", basename: "My Talk" } as unknown as Parameters<
      typeof buildPortableDeckHtml
    >[1];
    const { html, suggestedName } = await buildPortableDeckHtml(app, file);
    expect(suggestedName).toBe("My Talk.html");
    // interactive standalone (not print), and self-contained (no network).
    expect(html).toContain('"embedded":false');
    expect(html).not.toMatch(/https?:\/\/(cdn|unpkg)/);
    expect(html).not.toMatch(/localhost/);
    expect(html.length).toBeGreaterThan(100_000);
  });
});

describe("exportPortableHtmlWithPrompt (v0.13.31)", () => {
  test("falls back to a vault write when the save dialog is unreachable", async () => {
    // No Electron in bun's test env → showHtmlSaveDialog returns undefined
    // → the deck-named file is written to the vault root via the adapter.
    const app = new MockApp() as unknown as Parameters<
      typeof exportPortableHtmlWithPrompt
    >[0];
    const file = { path: "Decks/example.md", basename: "example" } as unknown as Parameters<
      typeof exportPortableHtmlWithPrompt
    >[1];
    const result = await exportPortableHtmlWithPrompt(app, file);
    expect(result.canceled).toBe(false);
    expect(result.usedVaultFallback).toBe(true);
    expect(result.savedPath).toBe("example.html");

    const written = (app as unknown as { vault: { adapter: MockAdapter } }).vault
      .adapter.written.get("example.html");
    expect(written).toBeDefined();
    expect(written).toContain('"embedded":false');
  });
});

describe("buildPdfUrlSuffix", () => {
  test("defaults to ?print-pdf only", () => {
    expect(buildPdfUrlSuffix()).toBe("?print-pdf");
    expect(buildPdfUrlSuffix({})).toBe("?print-pdf");
  });

  test("includes showNotes=true when requested", () => {
    expect(buildPdfUrlSuffix({ showNotes: true })).toBe(
      "?print-pdf&showNotes=true"
    );
  });

  test("omits showNotes when false / undefined", () => {
    expect(buildPdfUrlSuffix({ showNotes: false })).toBe("?print-pdf");
  });

  test("includes pdfMaxPagesPerSlide when >1", () => {
    expect(buildPdfUrlSuffix({ maxPagesPerSlide: 3 })).toBe(
      "?print-pdf&pdfMaxPagesPerSlide=3"
    );
  });

  test("omits pdfMaxPagesPerSlide when 1 or undefined", () => {
    expect(buildPdfUrlSuffix({ maxPagesPerSlide: 1 })).toBe("?print-pdf");
    expect(buildPdfUrlSuffix({})).toBe("?print-pdf");
  });

  test("combines all flags", () => {
    expect(
      buildPdfUrlSuffix({ showNotes: true, maxPagesPerSlide: 4 })
    ).toBe("?print-pdf&showNotes=true&pdfMaxPagesPerSlide=4");
  });

  test("aspectRatio + themeOverride are NOT in the URL (they go through renderDefaults)", () => {
    const url = buildPdfUrlSuffix({
      aspectRatio: "16:9",
      themeOverride: "white",
    });
    expect(url).toBe("?print-pdf");
  });
});

describe("exportDeckToFile", () => {
  test("writes a .slides-ng-export-<timestamp>.html to the vault", async () => {
    const app = new MockApp() as unknown as Parameters<typeof exportDeckToFile>[0];
    const file = { path: "Decks/example.md" } as unknown as Parameters<
      typeof exportDeckToFile
    >[1];
    const result = await exportDeckToFile(app, file, 999);
    expect(result.vaultRelativePath).toBe(".slides-ng-export-999.html");
    expect(result.absolutePath).toContain(".slides-ng-export-999.html");
    expect(result.html).toContain("<!doctype html>");
    expect(result.html).toContain('"embedded":false');

    const written = (app as unknown as { vault: { adapter: MockAdapter } }).vault
      .adapter.written.get(".slides-ng-export-999.html");
    expect(written).toBe(result.html);
  });

  test("renders pdfAspectWidth/pdfAspectHeight when caller sets them in defaults", () => {
    const html = renderDeckStandalone("---\n---\n\n# A\n", undefined, {
      pdfAspectWidth: 1280,
      pdfAspectHeight: 720,
    });
    expect(html).toContain('"width":1280');
    expect(html).toContain('"height":720');
  });

  test("each export with a different timestamp creates a fresh file", async () => {
    const app = new MockApp() as unknown as Parameters<typeof exportDeckToFile>[0];
    const file = { path: "Decks/example.md" } as unknown as Parameters<
      typeof exportDeckToFile
    >[1];
    const a = await exportDeckToFile(app, file, 1);
    const b = await exportDeckToFile(app, file, 2);
    expect(a.vaultRelativePath).not.toBe(b.vaultRelativePath);

    const written = (app as unknown as { vault: { adapter: MockAdapter } }).vault
      .adapter.written;
    expect(written.size).toBe(2);
  });
});

// v0.13.12: the export must inline images as data: URIs (same as the
// preview), else the exported .html / PDF shows broken images because a
// file:// browser tab can't load app://local / relative / <img src> paths.
describe("exportDeckToFile inlines images (parity with preview)", () => {
  function imageApp(): Parameters<typeof exportDeckToFile>[0] {
    const png = new Uint8Array([137, 80, 78, 71]).buffer;
    return {
      vault: {
        adapter: {
          written: new Map<string, string>(),
          async write(p: string, c: string) {
            (this.written as Map<string, string>).set(p, c);
          },
          getFullPath(p: string) {
            return "/vault/" + p;
          },
          async readBinary(p: string) {
            if (
              p === "Decks/assets/export-logo.png" ||
              p === "assets/export-hero.png"
            ) {
              return png;
            }
            throw new Error("not found: " + p);
          },
        },
        async read() {
          return '# S\n\n<img src="assets/export-logo.png" style="height:40px">\n\n![[export-hero.png]]\n';
        },
        getAbstractFileByPath(p: string) {
          return p === "Decks/assets/export-logo.png" ? { path: p } : null;
        },
      },
      metadataCache: {
        getFirstLinkpathDest(lp: string) {
          return lp === "export-hero.png"
            ? { path: "assets/export-hero.png" }
            : null;
        },
      },
    } as unknown as Parameters<typeof exportDeckToFile>[0];
  }

  test("raw <img> + wikilink embed both become data: URIs in the export", async () => {
    const app = imageApp();
    const file = { path: "Decks/deck.md" } as unknown as Parameters<
      typeof exportDeckToFile
    >[1];
    const result = await exportDeckToFile(app, file, 77);
    const dataUris = (result.html.match(/data:image\/png;base64,/g) ?? []).length;
    expect(dataUris).toBeGreaterThanOrEqual(2); // both images inlined
    // The raw, unloadable forms must be gone.
    expect(result.html).not.toContain('src="assets/export-logo.png"');
    expect(result.html).not.toContain("![[export-hero.png]]");
  });

  test("a caller-supplied resolveImage is respected (not overwritten)", async () => {
    const app = imageApp();
    const file = { path: "Decks/deck.md" } as unknown as Parameters<
      typeof exportDeckToFile
    >[1];
    const result = await exportDeckToFile(app, file, 78, {
      resolveImage: () => "data:image/png;base64,CALLER",
    });
    expect(result.html).toContain("data:image/png;base64,CALLER");
  });
});
