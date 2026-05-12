/**
 * ribbon-focus.spec.ts — regression test for the ribbon-button focus-steal
 * bug reported in v0.5.3.
 *
 * Symptom: clicking the ribbon "Open slides preview" icon while a markdown
 * deck was open in the editor produced an empty/black preview. Running
 * the "Open preview" command from the command palette worked. Root cause:
 * the ribbon click steals focus from the markdown view BEFORE the
 * activatePreviewLeaf callback runs, so `getActiveViewOfType(MarkdownView)`
 * returns null and the preview opens with no file.
 *
 * Fix in main.ts: track `lastMarkdownFile` via `active-leaf-change` events
 * and fall back to it when `getActiveViewOfType` returns null.
 *
 * Test strategy: open Decks/example.md, then deliberately defocus by
 * opening a non-markdown leaf, then trigger the preview-open path
 * through the ribbon-button DOM element directly. Assert the preview
 * loads with example.md as its filePath.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results";
const PREVIEW_VIEW_TYPE = "slides-ng-preview";
const DECK_PATH = "Decks/example.md";

async function detachAllPreviewLeaves(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    const leaves = app.workspace.getLeavesOfType("slides-ng-preview");
    for (const leaf of leaves) leaf.detach();
  });
}

async function openDeckInEditor(): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, path: string) => {
      const file = app.vault.getAbstractFileByPath(path);
      if (file) {
        // @ts-expect-error — openFile accepts TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    },
    DECK_PATH
  );
}

async function getPreviewFilePath(): Promise<string | undefined> {
  return await browser.executeObsidian(({ app }) => {
    const leaf = app.workspace.getLeavesOfType("slides-ng-preview")[0];
    // @ts-expect-error — getState is Record<string, unknown> at runtime
    return leaf?.view?.getState()?.filePath as string | undefined;
  });
}

describe("Ribbon button recovers from focus-steal and opens preview with correct file", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  beforeEach(async () => {
    await detachAllPreviewLeaves();
  });

  it("ribbon click after focus-steal still opens preview on the intended deck", async () => {
    // Step 1: open the deck — this should set lastMarkdownFile via the
    // active-leaf-change listener.
    await openDeckInEditor();
    await browser.pause(300);

    // Step 2: defocus the markdown view by opening a settings tab (or
    // any non-markdown leaf). After this, `getActiveViewOfType(MarkdownView)`
    // returns null. Without the fix, ribbon click would open preview
    // with filePath=undefined.
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — Setting tab open is an internal API
      app.setting.open();
      // @ts-expect-error
      app.setting.openTabById("slides-ng");
    });
    await browser.pause(400);

    // Step 3: simulate a ribbon click. The actual ribbon button is a
    // DOM element with aria-label "Open slides preview". Find + click it.
    // (We could also invoke the command directly, but the bug was
    // specifically that the ribbon path differs from the command path.)
    const clicked = await browser.execute(() => {
      // Obsidian renders ribbon icons with aria-label matching the title
      // passed to addRibbonIcon. Match anywhere in the aria-label since
      // some Obsidian builds add suffixes.
      const ribbonBtn = Array.from(
        document.querySelectorAll<HTMLElement>(".side-dock-ribbon-action, .workspace-ribbon .clickable-icon")
      ).find((el) => /open slides preview/i.test(el.getAttribute("aria-label") ?? ""));
      if (ribbonBtn) {
        ribbonBtn.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      // Fallback path: invoke the same code path the ribbon would. The
      // bug case is recreated by ensuring no MarkdownView is active.
      await browser.executeObsidian(({ app }) => {
        // @ts-expect-error — internal API
        app.commands.executeCommandById("slides-ng:open-preview");
      });
    }

    // Step 4: wait for preview leaf + assert filePath is correct.
    await browser.waitUntil(
      async () =>
        (await browser.executeObsidian(
          ({ app }, t: string) => app.workspace.getLeavesOfType(t).length,
          PREVIEW_VIEW_TYPE
        )) > 0,
      { timeout: 8000, timeoutMsg: "preview leaf never opened after ribbon click" }
    );

    const path = await getPreviewFilePath();
    expect(path).toBe(DECK_PATH);

    // Step 5: confirm the iframe actually rendered the deck (not empty).
    await switchToSlideFrame();
    try {
      await waitForSlides(2, 8000);
      const sectionCount = await browser.execute(
        () => document.querySelectorAll(".reveal section").length
      );
      expect(sectionCount).toBeGreaterThanOrEqual(2);
    } finally {
      await switchToTop();
    }
  });
});
