/**
 * toolbar-narrow.spec.ts — verify the preview toolbar stays a single,
 * tidy row when the preview pane is squeezed horizontally.
 *
 * History: the toolbar used `flex-wrap: wrap`, so at medium widths the
 * 9 buttons spilled onto a SECOND ROW — functional but ugly. v0.13.10
 * switched to `flex-wrap: nowrap` + `overflow-x: auto`: labels collapse
 * to icons first (container query), and only if the pane is
 * pathologically narrow does the row scroll horizontally. It never
 * wraps to a second row.
 *
 * Test strategy: force the `.slides-ng-view`'s inline-size to a narrow
 * pixel value, then measure every toolbar button's bounding rect. The
 * key property is SINGLE-ROW: all buttons share (within a few px) the
 * same vertical top, so the toolbar is one line, not two. Every button
 * must also render with non-zero width (no display:none clipping) —
 * buttons scrolled off the right edge still count (they have a real
 * width + top, just a larger left).
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results";
const PREVIEW_VIEW_TYPE = "slides-ng-preview";

interface ToolbarProbe {
  buttons: { text: string; width: number; top: number }[];
  /** true when every button sits on the same visual row (no wrap). */
  singleRow: boolean;
  /** vertical span across all buttons, in px (≈ one button height if single-row). */
  rowSpan: number;
}

async function probeToolbarAtWidth(pxWidth: number): Promise<ToolbarProbe> {
  return await browser.execute((w: number) => {
    const view = document.querySelector(".slides-ng-view") as HTMLElement | null;
    if (view) {
      view.style.width = `${w}px`;
      // Force reflow so container queries re-evaluate.
      void view.offsetWidth;
    }
    const buttons = Array.from(
      document.querySelectorAll(".slides-ng-toolbar .slides-ng-toolbar-btn")
    ) as HTMLElement[];
    const rects = buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return { text: (b.textContent ?? "").trim() || "(icon-only)", width: r.width, top: r.top };
    });
    const tops = rects.map((r) => r.top);
    const rowSpan = tops.length ? Math.max(...tops) - Math.min(...tops) : 0;
    return {
      buttons: rects,
      // A second row lands ~one-button-height lower; 6px slack absorbs
      // sub-pixel rounding and align-items jitter within a single row.
      singleRow: rowSpan <= 6,
      rowSpan,
    };
  }, pxWidth);
}

async function restoreToolbarWidth(): Promise<void> {
  await browser.execute(() => {
    const view = document.querySelector(".slides-ng-view") as HTMLElement | null;
    if (view) view.style.width = "";
  });
}

describe("Preview toolbar stays a single tidy row at narrow widths", function () {
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

  it("wide pane (600px): all buttons render on one row", async () => {
    const probe = await probeToolbarAtWidth(600);
    expect(probe.buttons.length).toBeGreaterThanOrEqual(5);
    for (const b of probe.buttons) expect(b.width).toBeGreaterThan(0);
    expect(probe.singleRow).toBe(true);
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/toolbar-600.png`);
  });

  it("medium pane (400px): labels collapse, still one row", async () => {
    const probe = await probeToolbarAtWidth(400);
    for (const b of probe.buttons) expect(b.width).toBeGreaterThan(0);
    expect(probe.singleRow).toBe(true);
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/toolbar-400.png`);
  });

  it("narrow pane (280px, icon-only): no wrap to a second row", async () => {
    const probe = await probeToolbarAtWidth(280);
    for (const b of probe.buttons) expect(b.width).toBeGreaterThan(0);
    expect(probe.singleRow).toBe(true);
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/toolbar-280.png`);
  });

  it("pathologically narrow (180px): scrolls, never wraps", async () => {
    const probe = await probeToolbarAtWidth(180);
    for (const b of probe.buttons) expect(b.width).toBeGreaterThan(0);
    // The row may overflow (scroll), but it must remain a SINGLE row.
    expect(probe.singleRow).toBe(true);
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/toolbar-180.png`);
  });
});
