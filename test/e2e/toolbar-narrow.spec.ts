/**
 * toolbar-narrow.spec.ts — verify NO preview-toolbar button is ever cut
 * off, at any pane width.
 *
 * History: v0.13.10 used `flex-wrap: nowrap` + `overflow-x: auto` with a
 * HIDDEN scrollbar to keep a single tidy row. But at medium widths the
 * buttons overflowed behind that hidden scrollbar — cut off at the right
 * edge and unreachable with a mouse (no visible scrollbar, no wrap).
 * v0.13.26 switched back to `flex-wrap: wrap` (groups flattened via
 * display:contents) so buttons wrap onto as many rows as needed and every
 * one stays reachable. Labels still collapse to icons first (container
 * query) to delay wrapping.
 *
 * Test strategy: force the `.slides-ng-view` inline-size to a narrow pixel
 * value, then measure every button. The key property is NO CUT-OFF: every
 * button renders with non-zero size AND its right edge stays within the
 * toolbar's box (wrapping keeps it in bounds; the old hidden-scroll
 * pushed buttons past the right edge). Multiple rows are expected + fine.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results";
const PREVIEW_VIEW_TYPE = "slides-ng-preview";

interface ToolbarProbe {
  buttons: { text: string; width: number; withinX: boolean }[];
  rows: number;
}

async function probeToolbarAtWidth(pxWidth: number): Promise<ToolbarProbe> {
  return await browser.execute((w: number) => {
    const view = document.querySelector(".slides-ng-view") as HTMLElement | null;
    if (view) {
      view.style.width = `${w}px`;
      void view.offsetWidth; // force reflow so container queries re-evaluate
    }
    const toolbar = document.querySelector(".slides-ng-toolbar") as HTMLElement | null;
    const tRect = toolbar!.getBoundingClientRect();
    const buttons = Array.from(
      document.querySelectorAll(".slides-ng-toolbar .slides-ng-toolbar-btn")
    ) as HTMLElement[];
    const rects = buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return {
        text: (b.textContent ?? "").trim() || "(icon-only)",
        width: r.width,
        // 1px slack for sub-pixel rounding. Cut-off buttons (old hidden
        // scroll) would have right > tRect.right; wrapped ones stay inside.
        withinX: r.left >= tRect.left - 1 && r.right <= tRect.right + 1,
      };
    });
    const tops = [
      ...new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))),
    ];
    return { buttons: rects, rows: tops.length };
  }, pxWidth);
}

async function restoreToolbarWidth(): Promise<void> {
  await browser.execute(() => {
    const view = document.querySelector(".slides-ng-view") as HTMLElement | null;
    if (view) view.style.width = "";
  });
}

describe("Preview toolbar never cuts off buttons (wraps instead)", function () {
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

  async function assertNoCutOff(width: number, screenshot?: string): Promise<void> {
    const probe = await probeToolbarAtWidth(width);
    expect(probe.buttons.length).toBeGreaterThanOrEqual(5);
    for (const b of probe.buttons) {
      expect(b.width).toBeGreaterThan(0); // rendered, not display:none-clipped
      expect(b.withinX).toBe(true); // inside the toolbar box — never cut off
    }
    if (screenshot) await browser.saveScreenshot(`${SCREENSHOT_DIR}/${screenshot}`);
  }

  it("wide pane (600px): all buttons within bounds", async () => {
    await assertNoCutOff(600, "toolbar-600.png");
  });

  it("medium pane (500px, labels shown): buttons wrap, none cut off", async () => {
    await assertNoCutOff(500, "toolbar-500.png");
  });

  it("narrow pane (320px, icon-only): buttons wrap, none cut off", async () => {
    await assertNoCutOff(320, "toolbar-320.png");
  });

  it("very narrow pane (200px): buttons wrap, none cut off", async () => {
    await assertNoCutOff(200, "toolbar-200.png");
  });
});
