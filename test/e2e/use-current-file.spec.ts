/**
 * use-current-file.spec.ts — v0.5.1 visual + integration test.
 *
 * Verifies the "Use current" toolbar button: when the markdown editor
 * shows a different deck than the preview, clicking the button swaps
 * the preview's source file. Important for the presenting-while-
 * referring-to-notes flow — auto-follow is intentionally off; the
 * switch must be explicit.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results";
const PREVIEW_VIEW_TYPE = "slides-ng-preview";

describe("'Use current' toolbar button swaps the preview source", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // Open the example deck first; preview will load it.
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/example.md");
      if (file) {
        // @ts-expect-error — openFile accepts TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    });
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });
    await browser.waitUntil(
      async () =>
        (await browser.executeObsidian(
          ({ app }, t: string) => app.workspace.getLeavesOfType(t).length,
          PREVIEW_VIEW_TYPE
        )) > 0,
      { timeout: 10000, timeoutMsg: "preview leaf never opened" }
    );
    await switchToSlideFrame();
    try {
      await waitForSlides(2, 8000);
    } finally {
      await switchToTop();
    }
  });

  it("renders the example deck initially", async () => {
    const path = await browser.executeObsidian(({ app }) => {
      const leaf = app.workspace.getLeavesOfType("slides-ng-preview")[0];
      // @ts-expect-error — getState returns Record<string, unknown> at runtime
      return leaf?.view?.getState()?.filePath;
    });
    expect(path).toBe("Decks/example.md");
  });

  it("clicking 'Use current' after switching the editor swaps the preview source", async () => {
    // Create a second deck and open it in the editor.
    const SECOND = "Decks/__use_current_target__.md";
    const body = "---\ntheme: simple\n---\n\n# Other deck\n\nDifferent content.\n";
    await browser.executeObsidian(
      async ({ app }, { path, content }: { path: string; content: string }) => {
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) {
          // @ts-expect-error — delete accepts TFile at runtime
          await app.vault.delete(existing);
        }
        // @ts-expect-error — create returns TFile
        await app.vault.create(path, content);
        const file = app.vault.getAbstractFileByPath(path);
        // @ts-expect-error — openFile accepts TFile
        await app.workspace.getLeaf(false).openFile(file);
      },
      { path: SECOND, content: body }
    );

    // Click the "Use current" button via the textContent matcher used
    // elsewhere — labels can be hidden by the container query on narrow
    // leaves, so don't rely on visual text.
    const clicked = await browser.execute(() => {
      const btns = Array.from(
        document.querySelectorAll(".slides-ng-toolbar .slides-ng-toolbar-btn")
      ) as HTMLButtonElement[];
      const target = btns.find((b) => (b.textContent ?? "").trim().startsWith("Use current"));
      if (target) {
        target.click();
        return true;
      }
      return false;
    });
    expect(clicked).toBe(true);

    // Wait for the preview to switch.
    await browser.waitUntil(
      async () => {
        const p = await browser.executeObsidian(({ app }) => {
          const leaf = app.workspace.getLeavesOfType("slides-ng-preview")[0];
          // @ts-expect-error — getState is Record at runtime
          return leaf?.view?.getState()?.filePath;
        });
        return p === SECOND;
      },
      { timeout: 5000, timeoutMsg: "preview never switched to the focused file" }
    );

    // Confirm the iframe re-rendered with the new deck's content.
    await switchToSlideFrame();
    try {
      await browser.waitUntil(
        async () => {
          const titles = await browser.execute(() =>
            Array.from(document.querySelectorAll(".reveal section h1")).map(
              (h) => (h as HTMLElement).innerText.trim()
            )
          );
          return titles.includes("Other deck");
        },
        { timeout: 5000, timeoutMsg: "iframe never reflected the new deck's first slide" }
      );
    } finally {
      await switchToTop();
    }

    // Cleanup.
    await browser.executeObsidian(async ({ app }, path: string) => {
      const f = app.vault.getAbstractFileByPath(path);
      if (f) {
        // @ts-expect-error — delete accepts TFile
        await app.vault.delete(f);
      }
    }, SECOND);
  });

  it("clicking 'Use current' uses the last-focused markdown file when no markdown view is currently active", async () => {
    // v0.7.1 behaviour: clicking the toolbar steals focus from the
    // markdown view. The plugin tracks lastMarkdownFile via active-
    // leaf-change so we still resolve to the user's intended deck.
    // Open example.md as the most-recently-focused markdown file.
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/example.md");
      if (file) {
        // @ts-expect-error — openFile accepts TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    });
    await browser.pause(200);

    // Now detach all markdown leaves so `getActiveViewOfType(MarkdownView)`
    // returns null — but lastMarkdownFile still points at example.md.
    await browser.executeObsidian(({ app }) => {
      const leaves = app.workspace.getLeavesOfType("markdown");
      for (const leaf of leaves) leaf.detach();
    });
    await browser.pause(200);

    // Click "Use current". With the v0.7.1 focus-steal fix, this
    // resolves to lastMarkdownFile and swaps the preview accordingly.
    await browser.execute(() => {
      const btns = Array.from(
        document.querySelectorAll(".slides-ng-toolbar .slides-ng-toolbar-btn")
      ) as HTMLButtonElement[];
      const target = btns.find((b) => (b.textContent ?? "").trim().startsWith("Use current"));
      target?.click();
    });

    await browser.waitUntil(
      async () => {
        const p = await browser.executeObsidian(({ app }) => {
          const leaf = app.workspace.getLeavesOfType("slides-ng-preview")[0];
          // @ts-expect-error
          return leaf?.view?.getState()?.filePath;
        });
        return p === "Decks/example.md";
      },
      { timeout: 5000, timeoutMsg: "preview never swapped to last-focused markdown file" }
    );

    const afterPath = await browser.executeObsidian(({ app }) => {
      const leaf = app.workspace.getLeavesOfType("slides-ng-preview")[0];
      // @ts-expect-error
      return leaf?.view?.getState()?.filePath;
    });
    expect(afterPath).toBe("Decks/example.md");
  });
});
