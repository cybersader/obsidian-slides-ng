import { test, expect, describe } from "bun:test";
import {
  buildExportFilename,
  exportDeckToFile,
} from "../src/export/exportStandalone";
import { renderDeckStandalone, renderDeck } from "../src/render/renderDeck";

describe("buildExportFilename", () => {
  test("uses the given timestamp", () => {
    expect(buildExportFilename(1234567890)).toBe(".slides-ng-export-1234567890.html");
  });

  test("each call with a different timestamp produces a different name", () => {
    expect(buildExportFilename(1)).not.toBe(buildExportFilename(2));
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
