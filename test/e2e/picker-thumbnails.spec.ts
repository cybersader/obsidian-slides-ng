/**
 * picker-thumbnails.spec.ts — v0.11.0 PowerPoint-style picker.
 *
 * Verifies:
 *  - Speaker view mounts a picker iframe (not the legacy text list)
 *    when speakerPickerStyle = "thumbnails" (the default)
 *  - The iframe loads + builds the strip overlay
 *  - The orientation-toggle button flips vertical ↔ horizontal
 *  - Clicking a thumbnail tile drives the MAIN preview to that slide
 *  - Captures screenshots of both orientations for human review.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results";
const PREVIEW_VIEW_TYPE = "slides-ng-preview";
const SPEAKER_VIEW_TYPE = "slides-ng-speaker";

describe("v0.11.0 picker thumbnails", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // Open the conference-talk deck (10 slides — more than enough for
    // a meaningful strip).
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/01-conference-talk.md");
      if (file) {
        // @ts-expect-error — openFile accepts a TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    });

    // Open preview + speaker view.
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });
    await browser.waitUntil(
      async () =>
        (await browser.executeObsidian(({ app }, viewType: string) => {
          return app.workspace.getLeavesOfType(viewType).length;
        }, PREVIEW_VIEW_TYPE)) > 0,
      { timeout: 10000, timeoutMsg: "preview leaf never opened" }
    );
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-speaker-view");
    });
    await browser.waitUntil(
      async () =>
        (await browser.executeObsidian(({ app }, viewType: string) => {
          return app.workspace.getLeavesOfType(viewType).length;
        }, SPEAKER_VIEW_TYPE)) > 0,
      { timeout: 10000, timeoutMsg: "speaker leaf never opened" }
    );
    // Give the picker iframe time to render + enablePickerStrip burst
    // to land.
    await new Promise((r) => setTimeout(r, 2000));
  });

  it("mounts the picker iframe (thumbnails style is the default)", async () => {
    const iframeExists = await browser.execute(() => {
      return !!document.querySelector(".slides-ng-speaker-picker-iframe");
    });
    expect(iframeExists).toBe(true);

    const textListExists = await browser.execute(() => {
      return document.querySelectorAll(".slides-ng-speaker-list-item").length;
    });
    expect(textListExists).toBe(0);
  });

  it("the picker iframe has a non-empty srcdoc (deck rendered into it)", async () => {
    // Sandbox=allow-scripts blocks contentDocument from the parent;
    // best signal that the iframe has the deck loaded is that the
    // srcdoc attribute is set + non-trivial in size.
    const srcdocLength = await browser.execute(() => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        ".slides-ng-speaker-picker-iframe"
      );
      return iframe?.srcdoc?.length ?? 0;
    });
    // renderDeck output is ~280 KB for the conference talk deck.
    expect(srcdocLength).toBeGreaterThan(50000);
  });

  it("the orientation-toggle button is present in the picker header", async () => {
    const present = await browser.execute(() => {
      return !!document.querySelector(".slides-ng-speaker-picker-orient-btn");
    });
    expect(present).toBe(true);
  });

  it("captures vertical-orientation screenshot", async () => {
    await browser.saveScreenshot(
      `${SCREENSHOT_DIR}/v0110-picker-vertical.png`
    );
  });

  it("clicking the orientation button persists the new orientation in settings", async () => {
    const before = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — plugins is internal
      const plugin = app.plugins.plugins["slides-ng"];
      return plugin?.settings?.speakerPickerOrientation ?? null;
    });
    expect(before).toBe("vertical");

    await browser.execute(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        ".slides-ng-speaker-picker-orient-btn"
      );
      btn?.click();
    });

    await browser.waitUntil(
      async () => {
        const cur = await browser.executeObsidian(({ app }) => {
          // @ts-expect-error — plugins is internal
          const plugin = app.plugins.plugins["slides-ng"];
          return plugin?.settings?.speakerPickerOrientation ?? null;
        });
        return cur === "horizontal";
      },
      { timeout: 3000, timeoutMsg: "orientation didn't flip to horizontal" }
    );
  });

  it("captures horizontal-orientation screenshot", async () => {
    // Give the iframe a beat to repaint after the postMessage.
    await new Promise((r) => setTimeout(r, 500));
    await browser.saveScreenshot(
      `${SCREENSHOT_DIR}/v0110-picker-horizontal.png`
    );
  });

  it("simulated tile-click postMessage drives the main preview", async () => {
    // The actual click happens inside the sandboxed iframe, which we
    // can't reach from the parent. Simulate the message the iframe
    // would post to verify the speaker view's forwarding works.
    const startPos = await browser.execute(() => {
      const el = document.querySelector(
        ".slides-ng-speaker-position"
      ) as HTMLElement | null;
      return el?.textContent ?? "";
    });

    await browser.execute(() => {
      window.postMessage(
        { type: "slides-ng-picker", event: "click", idx: 2 },
        "*"
      );
    });

    await browser.waitUntil(
      async () => {
        const pos = await browser.execute(() => {
          const el = document.querySelector(
            ".slides-ng-speaker-position"
          ) as HTMLElement | null;
          return el?.textContent ?? "";
        });
        return (
          typeof pos === "string" &&
          pos.includes("Slide 3 of") &&
          pos !== startPos
        );
      },
      { timeout: 5000, timeoutMsg: "main preview never advanced to slide 3" }
    );
  });

  it("flips back to vertical for cleanup", async () => {
    await browser.execute(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        ".slides-ng-speaker-picker-orient-btn"
      );
      btn?.click();
    });
  });
});
