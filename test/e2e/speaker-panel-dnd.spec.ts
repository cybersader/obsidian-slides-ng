/**
 * speaker-panel-dnd.spec.ts — v0.8.1 integration test for the drag-
 * and-drop reorder of speaker-view panels.
 *
 * WebDriver's drag simulation is finicky (browser DnD events need
 * specific timing). Instead of trying to simulate a real drag, this
 * spec verifies the OBSERVABLE outcome: setting `speakerPanelOrder`
 * programmatically (the same write the drop handler performs) AND
 * reopening the speaker view results in the panels appearing in
 * the configured order. Plus checks the drag-handle DOM is present.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";

const PREVIEW = "slides-ng-preview";
const SPEAKER = "slides-ng-speaker";

async function setupPreviewAndSpeaker(): Promise<void> {
  // Note: executeObsidian runs in browser context — string constants
  // from this module aren't in scope there, so we inline the type names.
  await browser.executeObsidian(({ app }) => {
    for (const t of ["slides-ng-speaker", "slides-ng-preview"]) {
      for (const leaf of app.workspace.getLeavesOfType(t)) leaf.detach();
    }
  });
  await browser.executeObsidian(async ({ app }) => {
    const f = app.vault.getAbstractFileByPath("Decks/example.md");
    // @ts-expect-error openFile accepts TFile at runtime
    if (f) await app.workspace.getLeaf(false).openFile(f);
    // @ts-expect-error internal API
    app.commands.executeCommandById("slides-ng:open-preview");
  });
  await browser.waitUntil(
    async () =>
      (await browser.executeObsidian(
        ({ app }, t: string) => app.workspace.getLeavesOfType(t).length,
        PREVIEW
      )) > 0,
    { timeout: 10000 }
  );
  await switchToSlideFrame();
  try {
    await waitForSlides(2, 8000);
  } finally {
    await switchToTop();
  }
  await browser.executeObsidian(({ app }) => {
    // @ts-expect-error internal API
    app.commands.executeCommandById("slides-ng:open-speaker-view");
  });
  await browser.waitUntil(
    async () =>
      (await browser.executeObsidian(
        ({ app }, t: string) => app.workspace.getLeavesOfType(t).length,
        SPEAKER
      )) > 0,
    { timeout: 8000 }
  );
  await browser.waitUntil(
    async () => {
      const t = await browser.execute(() => {
        const el = document.querySelector(".slides-ng-speaker-position") as HTMLElement | null;
        return el?.textContent?.trim() ?? "";
      });
      return /Slide \d+ of \d+/.test(t);
    },
    { timeout: 8000 }
  );
}

describe("v0.8.1 — speaker panel reorder (DnD)", function () {
  before(async () => {
    await setupPreviewAndSpeaker();
  });

  it("every panel has a drag handle (.slides-ng-speaker-panel-handle)", async () => {
    const counts = await browser.execute(() => {
      return {
        panels: document.querySelectorAll(".slides-ng-speaker [data-speaker-panel]").length,
        handles: document.querySelectorAll(".slides-ng-speaker-panel-handle").length,
      };
    });
    // 8 panels expected; handles should match the panel count.
    expect(counts.panels).toBeGreaterThanOrEqual(7);
    expect(counts.handles).toBe(counts.panels);
  });

  it("setting speakerPanelOrder + reopening reorders the panels in the DOM", async () => {
    const reversedOrder: string[] = [
      "picker",
      "notes",
      "scenes",
      "visualNext",
      "nextLine",
      "timer",
      "controls",
      "status",
    ];

    // Write the reversed order to settings + reopen the speaker view.
    await browser.executeObsidian(
      async ({ app }, order: string[]) => {
        // @ts-expect-error internal plugin access
        const plugin = app.plugins.plugins["slides-ng"];
        // @ts-expect-error
        plugin.settings.speakerPanelOrder = order;
        // @ts-expect-error
        await plugin.saveSettings();
        for (const leaf of app.workspace.getLeavesOfType("slides-ng-speaker")) {
          leaf.detach();
        }
        // @ts-expect-error internal API
        app.commands.executeCommandById("slides-ng:open-speaker-view");
      },
      reversedOrder
    );
    // Wait for the new speaker view to mount.
    await browser.waitUntil(
      async () =>
        (await browser.executeObsidian(
          ({ app }, t: string) => app.workspace.getLeavesOfType(t).length,
          SPEAKER
        )) > 0,
      { timeout: 8000 }
    );
    await browser.pause(300);

    // Assert the DOM order matches the configured order.
    const domOrder = await browser.execute(() => {
      return Array.from(
        document.querySelectorAll(".slides-ng-speaker [data-speaker-panel]")
      ).map((el) => (el as HTMLElement).dataset.speakerPanel ?? "");
    });
    expect(domOrder).toEqual(reversedOrder);
  });

  it("resetting speakerPanelOrder to defaults restores the source order on reopen", async () => {
    await browser.executeObsidian(async ({ app }) => {
      // @ts-expect-error internal
      const plugin = app.plugins.plugins["slides-ng"];
      // @ts-expect-error
      plugin.settings.speakerPanelOrder = [
        "status",
        "controls",
        "timer",
        "nextLine",
        "visualNext",
        "scenes",
        "notes",
        "picker",
      ];
      // @ts-expect-error
      await plugin.saveSettings();
      for (const leaf of app.workspace.getLeavesOfType("slides-ng-speaker")) {
        leaf.detach();
      }
      // @ts-expect-error
      app.commands.executeCommandById("slides-ng:open-speaker-view");
    });
    await browser.waitUntil(
      async () =>
        (await browser.executeObsidian(
          ({ app }, t: string) => app.workspace.getLeavesOfType(t).length,
          SPEAKER
        )) > 0,
      { timeout: 8000 }
    );
    await browser.pause(300);

    const domOrder = await browser.execute(() => {
      return Array.from(
        document.querySelectorAll(".slides-ng-speaker [data-speaker-panel]")
      ).map((el) => (el as HTMLElement).dataset.speakerPanel ?? "");
    });
    expect(domOrder[0]).toBe("status");
    expect(domOrder[domOrder.length - 1]).toBe("picker");
  });
});
