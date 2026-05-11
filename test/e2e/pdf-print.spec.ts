/**
 * pdf-print.spec.ts — M7 PDF print export coverage.
 *
 * Runs slides-ng:export-for-pdf, verifies the exported file exists, and
 * that the HTML is the standalone variant (embedded:false). Reveal.js's
 * own logic handles the `?print-pdf` URL query at runtime to flatten
 * slides into pages for printing — we just need to launch with the
 * suffix, which exportAndOpenForPdf does.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";

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

  it("writes a self-contained standalone HTML file when run", async () => {
    // Make sure a deck is loaded.
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/example.md");
      if (file) {
        // @ts-expect-error — TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    });

    const writtenPath = await browser.executeObsidian(async ({ app }) => {
      // @ts-expect-error — adapter.list is internal API
      const before = (await app.vault.adapter.list("/")).files as string[];
      const beforeSet = new Set(before.filter((p) => p.includes(".slides-ng-export-")));

      // @ts-expect-error — internal API
      await app.commands.executeCommandById("slides-ng:export-for-pdf");

      for (let i = 0; i < 20; i++) {
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

    // Reveal.js's print mode is triggered by the URL query string, not
    // by any change in the HTML. So the export file itself is just the
    // standard standalone HTML — the workflow appends ?print-pdf at
    // openExternal time.
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('"embedded":false');
    expect(html).toContain('class="reveal"');
  });
});
