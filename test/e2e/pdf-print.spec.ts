/**
 * pdf-print.spec.ts — M7 PDF print export coverage + v0.9.0 options modal.
 *
 * Runs slides-ng:export-for-pdf, verifies the options modal appears,
 * clicks Export, and confirms the exported file is the standalone
 * variant (embedded:false). Reveal.js handles the `?print-pdf` URL
 * query at runtime to flatten slides into pages — we just need to
 * launch with the suffix, which exportAndOpenForPdf does.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results";

async function loadDeck(): Promise<void> {
  await browser.executeObsidian(async ({ app }) => {
    const file = app.vault.getAbstractFileByPath("Decks/example.md");
    if (file) {
      // @ts-expect-error — TFile at runtime
      await app.workspace.getLeaf(false).openFile(file);
    }
  });
}

describe("slides-ng PDF print export", function () {
  it("registers the export-for-pdf command", async () => {
    const info = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — findCommand is internal API
      const cmd = app.commands.findCommand("slides-ng:export-for-pdf");
      return { found: !!cmd, name: cmd?.name };
    });
    expect(info.found).toBe(true);
    expect(info.name).toMatch(/pdf/i);
  });

  it("opens the options modal when the command runs", async () => {
    await loadDeck();

    await browser.executeObsidian(async ({ app }) => {
      // @ts-expect-error — internal API
      await app.commands.executeCommandById("slides-ng:export-for-pdf");
    });

    const modal = await browser.$(".slides-ng-export-pdf-modal");
    await modal.waitForExist({ timeout: 3000 });
    await expect(modal.isDisplayed()).resolves.toBe(true);

    // Sanity: the three knobs should all be present.
    // WDIO v9 changed ElementArray's iteration — `.map()` no longer
    // exists. Read via browser.execute so we stay decoupled from the
    // exact element-array API shape.
    const texts = await browser.execute(() => {
      return Array.from(
        document.querySelectorAll(
          ".slides-ng-export-pdf-modal .setting-item-name"
        )
      ).map((el) => (el as HTMLElement).textContent?.trim() ?? "");
    });
    expect(texts.join("|").toLowerCase()).toContain("speaker notes");
    expect(texts.join("|").toLowerCase()).toContain("aspect ratio");
    expect(texts.join("|").toLowerCase()).toContain("theme override");

    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/v090-pdf-export-modal.png`);

    // Cancel out (closing the modal must not write a file).
    const cancel = await browser.$('.slides-ng-export-pdf-modal button.mod-warning');
    await cancel.click();
    await modal.waitForExist({ reverse: true, timeout: 2000 });
  });

  it("writes a self-contained standalone HTML file when Export is clicked", async () => {
    await loadDeck();

    const writtenPath = await browser.executeObsidian(async ({ app }) => {
      // @ts-expect-error — adapter.list is internal API
      const before = (await app.vault.adapter.list("/")).files as string[];
      const beforeSet = new Set(
        before.filter((p) => p.includes(".slides-ng-export-"))
      );

      // @ts-expect-error — internal API
      await app.commands.executeCommandById("slides-ng:export-for-pdf");

      // Wait for the modal, then click Export.
      for (let i = 0; i < 20; i++) {
        const m = document.querySelector(".slides-ng-export-pdf-modal");
        if (m) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const exportBtn = document.querySelector(
        ".slides-ng-export-pdf-modal button.mod-cta"
      ) as HTMLButtonElement | null;
      exportBtn?.click();

      for (let i = 0; i < 30; i++) {
        // @ts-expect-error — adapter.list is internal API
        const after = (await app.vault.adapter.list("/")).files as string[];
        const newOnes = after.filter(
          (p) => p.includes(".slides-ng-export-") && !beforeSet.has(p)
        );
        if (newOnes.length > 0) return newOnes[0];
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    });

    expect(writtenPath).not.toBeNull();
    expect(writtenPath).toMatch(/^\.slides-ng-export-\d+\.html$/);

    const html = await browser.executeObsidian(
      async ({ app }, p: string) => {
        // @ts-expect-error — adapter.read is internal API
        return (await app.vault.adapter.read(p)) as string;
      },
      writtenPath as string
    );

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('"embedded":false');
    expect(html).toContain('class="reveal"');
  });

  // v0.11.32: spy on electron.shell.openExternal so we can verify
  // the exact URL that would have launched the user's browser. This
  // is the missing piece v0.11.31's unit test couldn't cover —
  // proves the FULL pipeline (modal → exportAndOpenForPdf →
  // pathToFileUrl → shell.openExternal) emits a clean
  // `file:///...?print-pdf&showNotes=true` URL.
  describe("PDF export URL pipeline (E2E)", function () {
    it("emits a well-formed file:// URL with print-pdf + showNotes when notes are enabled", async () => {
      await loadDeck();
      // Install the spy inside Obsidian's renderer process. Replaces
      // electron.shell.openExternal with a recorder; restores at the
      // end. We use `require` because Obsidian's renderer is a
      // CommonJS-ish environment.
      const opened: string | null = await browser.executeObsidian(
        async ({ app }) => {
          // @ts-expect-error — Node require is available in the renderer
          const electron = require("electron");
          const original = electron.shell.openExternal;
          let captured: string | null = null;
          electron.shell.openExternal = async (url: string) => {
            captured = url;
            return true;
          };
          try {
            // @ts-expect-error — internal API
            await app.commands.executeCommandById("slides-ng:export-for-pdf");
            // Wait for modal, flip "Show speaker notes" ON, then Export.
            for (let i = 0; i < 30; i++) {
              const m = document.querySelector(".slides-ng-export-pdf-modal");
              if (m) break;
              await new Promise((r) => setTimeout(r, 100));
            }
            // Toggle the notes checkbox. The modal renders Obsidian's
            // <Setting> rows; the toggle is an input[type=checkbox]
            // inside a row whose label matches /speaker notes/i.
            const settings = Array.from(
              document.querySelectorAll(
                ".slides-ng-export-pdf-modal .setting-item"
              )
            );
            for (const row of settings) {
              const name = row
                .querySelector(".setting-item-name")
                ?.textContent?.toLowerCase();
              if (name && /speaker notes/i.test(name)) {
                const toggle = row.querySelector(
                  ".checkbox-container, input[type=checkbox]"
                ) as HTMLElement | null;
                toggle?.click();
                break;
              }
            }
            // Click Export.
            const exportBtn = document.querySelector(
              ".slides-ng-export-pdf-modal button.mod-cta"
            ) as HTMLButtonElement | null;
            exportBtn?.click();
            // Poll for the spied URL.
            for (let i = 0; i < 50; i++) {
              if (captured) break;
              await new Promise((r) => setTimeout(r, 100));
            }
            return captured;
          } finally {
            electron.shell.openExternal = original;
          }
        }
      );
      expect(opened).not.toBeNull();
      // eslint-disable-next-line no-console
      console.log(`[pdf-pipeline] electron.shell.openExternal got: ${opened}`);
      // Required pieces of the URL:
      expect(opened).toMatch(/^file:\/\//);
      expect(opened).toContain("?print-pdf");
      expect(opened).toContain("showNotes=true");
      // RFC-compliant: should parse via the URL constructor.
      const parsed = new URL(opened as string);
      expect(parsed.searchParams.get("print-pdf")).toBe("");
      expect(parsed.searchParams.get("showNotes")).toBe("true");
    });
  });
});
