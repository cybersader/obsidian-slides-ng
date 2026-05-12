/**
 * toolbar-narrow.spec.ts — verify the preview toolbar stays usable when
 * the preview pane is squeezed horizontally.
 *
 * Bug being prevented: at narrow leaf widths the toolbar buttons used
 * to overflow off the right edge of the pane (no flex-wrap, no
 * container query to collapse labels). v0.5.2 added wrap + label
 * collapse + spacer collapse at successive breakpoints.
 *
 * Test strategy: forcibly set the `.slides-ng-view`'s inline-size to a
 * narrow pixel value and measure every toolbar button's
 * getBoundingClientRect against the toolbar's. No button should land
 * outside the toolbar's horizontal bounds; every button must still
 * render with non-zero width (i.e. no display:none clipping).
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results";
const PREVIEW_VIEW_TYPE = "slides-ng-preview";

interface ButtonRect {
  text: string;
  withinX: boolean;
  renderedWidth: number;
}

async function inspectToolbarAtWidth(pxWidth: number): Promise<ButtonRect[]> {
  // Override the .slides-ng-view container's inline-size, then read each
  // button's bounding rect relative to the toolbar.
  return await browser.execute((w: number) => {
    const view = document.querySelector(".slides-ng-view") as HTMLElement | null;
    if (view) {
      view.style.width = `${w}px`;
      // Force reflow so container queries re-evaluate.
      void view.offsetWidth;
    }
    const toolbar = document.querySelector(".slides-ng-toolbar") as HTMLElement | null;
    if (!toolbar) return [];
    const tRect = toolbar.getBoundingClientRect();
    const buttons = Array.from(
      document.querySelectorAll(".slides-ng-toolbar .slides-ng-toolbar-btn")
    ) as HTMLElement[];
    return buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return {
        text: (b.textContent ?? "").trim() || "(icon-only)",
        // Allow 1px slack on the right (sub-pixel rounding); accept buttons
        // whose horizontal extent stays inside the toolbar's box.
        withinX: r.left >= tRect.left - 1 && r.right <= tRect.right + 1,
        renderedWidth: r.width,
      };
    });
  }, pxWidth);
}

async function restoreToolbarWidth(): Promise<void> {
  await browser.execute(() => {
    const view = document.querySelector(".slides-ng-view") as HTMLElement | null;
    if (view) view.style.width = "";
  });
}

describe("Preview toolbar handles narrow leaf widths", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

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

  afterEach(async () => {
    await restoreToolbarWidth();
  });

  it("buttons fit at a wide pane (600px)", async () => {
    const rects = await inspectToolbarAtWidth(600);
    expect(rects.length).toBeGreaterThanOrEqual(5); // Reload, Use current, Speaker, Open in browser, Export PDF
    for (const r of rects) {
      expect(r.renderedWidth).toBeGreaterThan(0);
      expect(r.withinX).toBe(true);
    }
  });

  it("buttons stay inside the toolbar at 400px (labels start to collapse)", async () => {
    const rects = await inspectToolbarAtWidth(400);
    for (const r of rects) {
      expect(r.renderedWidth).toBeGreaterThan(0);
      expect(r.withinX).toBe(true);
    }
  });

  it("buttons stay inside the toolbar at 280px (icon-only)", async () => {
    const rects = await inspectToolbarAtWidth(280);
    for (const r of rects) {
      expect(r.renderedWidth).toBeGreaterThan(0);
      expect(r.withinX).toBe(true);
    }
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/toolbar-narrow-280.png`);
  });

  it("buttons stay inside the toolbar at extreme narrow (180px)", async () => {
    // At < 220px the spacer collapses and the toolbar may wrap to a
    // second row. Either way: every button must still be visible AND
    // within the toolbar's horizontal bounds.
    const rects = await inspectToolbarAtWidth(180);
    for (const r of rects) {
      expect(r.renderedWidth).toBeGreaterThan(0);
      expect(r.withinX).toBe(true);
    }
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/toolbar-narrow-180.png`);
  });
});
