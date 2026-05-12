/**
 * open-in-browser.spec.ts — M6 visual + integration test.
 *
 * Runs the slides-ng:open-in-browser command in real Obsidian, then:
 *   - verifies the export file lands in the vault at the expected name
 *   - verifies the file is a self-contained HTML doc with embedded:false
 *   - verifies the toolbar shows both Reload + Open-in-browser buttons
 *   - captures a screenshot of the SlidesNG view with both buttons visible
 *
 * What we explicitly DON'T verify: that electron.shell.openExternal
 * actually launched the user's default browser. That's an Electron IPC
 * boundary we can't observe from WDIO. We trust the API; the plugin code
 * just needs to invoke it correctly.
 */

import { browser, $ } from "@wdio/globals";
import { expect } from "expect";
import { SLIDE_IFRAME_SELECTOR } from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results/m6";

describe("slides-ng open-in-browser", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // Open the example deck and preview pane.
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/example.md");
      if (file) {
        // @ts-expect-error — TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    });
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });

    const iframe = await $(SLIDE_IFRAME_SELECTOR);
    await iframe.waitForExist({ timeout: 5000 });
  });

  it("registers the open-in-browser command", async () => {
    const info = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — findCommand is internal API
      const cmd = app.commands.findCommand("slides-ng:open-in-browser");
      return { found: !!cmd, name: cmd?.name };
    });
    expect(info.found).toBe(true);
    expect(info.name).toMatch(/open in browser/i);
  });

  it("writes a .slides-ng-export-<timestamp>.html file to the vault", async () => {
    const writtenPath = await browser.executeObsidian(async ({ app }) => {
      // Snapshot existing exports first so we can detect the new one.
      // @ts-expect-error — adapter.list is internal API
      const before = (await app.vault.adapter.list("/")).files as string[];
      const beforeSet = new Set(before.filter((p) => p.includes(".slides-ng-export-")));

      // @ts-expect-error — internal API
      await app.commands.executeCommandById("slides-ng:open-in-browser");

      // Poll briefly for the file to appear (write is async).
      let after: string[] = [];
      for (let i = 0; i < 20; i++) {
        // @ts-expect-error — adapter.list is internal API
        after = (await app.vault.adapter.list("/")).files as string[];
        const newFiles = after.filter(
          (p) => p.includes(".slides-ng-export-") && !beforeSet.has(p)
        );
        if (newFiles.length > 0) return newFiles[0];
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return null;
    });

    expect(writtenPath).not.toBeNull();
    expect(writtenPath).toMatch(/^\.slides-ng-export-\d+\.html$/);
  });

  it("the exported HTML is self-contained and uses embedded:false", async () => {
    const result = await browser.executeObsidian(async ({ app }) => {
      // @ts-expect-error — adapter.list is internal API
      const all = (await app.vault.adapter.list("/")).files as string[];
      const exports = all.filter((p) => p.includes(".slides-ng-export-"));
      if (exports.length === 0) return null;
      // Most recent first.
      exports.sort();
      const latest = exports[exports.length - 1];
      // @ts-expect-error — adapter.read is internal API
      const content = (await app.vault.adapter.read(latest)) as string;
      return {
        path: latest,
        length: content.length,
        hasDoctype: content.startsWith("<!doctype html>"),
        hasEmbeddedFalse: content.includes('"embedded":false'),
        hasControlsTrue: content.includes('"controls":true'),
        // URL-form checks only — slide content can legitimately mention
        // the word "localhost" in prose (e.g. example.md has "No localhost.").
        hasNetworkRefs:
          /https?:\/\/(?:cdn\.|unpkg|jsdelivr|localhost|127\.0\.0\.1)/i.test(content),
        hasReveal: content.includes('class="reveal"'),
      };
    });

    expect(result).not.toBeNull();
    // The export is the full inlined deck — ≥100 KB.
    expect(result!.length).toBeGreaterThan(100_000);
    expect(result!.hasDoctype).toBe(true);
    expect(result!.hasEmbeddedFalse).toBe(true);
    expect(result!.hasControlsTrue).toBe(true);
    expect(result!.hasReveal).toBe(true);
    expect(result!.hasNetworkRefs).toBe(false);
  });

  it("toolbar shows both Reload + Open-in-browser buttons", async () => {
    // Use textContent rather than innerText: when the leaf is narrow,
    // a container query hides the label visually (`display: none`) which
    // makes innerText return ''. textContent still reflects the DOM text.
    const buttonTexts = await browser.execute(() => {
      const btns = Array.from(
        document.querySelectorAll(".slides-ng-toolbar .slides-ng-toolbar-btn")
      ) as HTMLButtonElement[];
      return btns.map((b) => (b.textContent ?? "").trim());
    });
    expect(buttonTexts).toContain("Reload");
    expect(buttonTexts).toContain("Open in browser");
  });

  it("captures a screenshot of the M6 toolbar + exported deck", async () => {
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/m6-frame.png`);
  });
});
