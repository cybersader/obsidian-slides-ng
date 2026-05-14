/**
 * picker-sizing.spec.ts — v0.11.20 picker tile geometry coverage.
 *
 * Drives the speaker view picker through every orientation × magnifier
 * combination at multiple viewport widths. For each combination:
 *   1. Wait for the picker iframe to settle.
 *   2. Switch INTO the picker iframe (sandboxed, but CDP can enter it).
 *   3. Measure each tile's actual rendered geometry — clientWidth,
 *      clientHeight, and the inner `.slides-ng-picker-thumb-content`'s
 *      computed transform matrix.
 *   4. Compute the SCALED content size = transformScale * SLIDE_W and
 *      compare to the tile's clientWidth. If `scaledContentWidth` exceeds
 *      tile width by more than 4 px the content is overflowing the tile
 *      (the v0.11.18 / v0.11.19 bug fingerprint).
 *   5. Screenshot the combo for human review.
 *
 * Notes:
 *   - The iframe element has `sandbox="allow-scripts"` only. WDIO's
 *     switchFrame works because it routes through CDP rather than the
 *     same-origin contentDocument bridge.
 *   - Reads are taken AFTER a 600 ms settle delay to let the per-tile
 *     ResizeObserver fire and the relayout debounce land.
 *   - The 4 px tolerance allows for sub-pixel rounding without flaking.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results/picker-sizing";
const PREVIEW_VIEW_TYPE = "slides-ng-preview";
const SPEAKER_VIEW_TYPE = "slides-ng-speaker";
const SLIDE_W = 960; // reveal.js default stage width

type Orientation = "vertical-1" | "vertical-2" | "horizontal" | "auto";
type TileSize = "auto" | "compact" | "comfortable" | "big";

const ORIENTATIONS: Orientation[] = [
  "vertical-1",
  "vertical-2",
  "horizontal",
  "auto",
];
const TILE_SIZES: TileSize[] = ["auto", "compact", "comfortable", "big"];
const TILE_SIZE_PX: Record<TileSize, number> = {
  auto: 0,
  compact: 100,
  comfortable: 180,
  big: 280,
};

interface TileGeom {
  idx: number;
  tileW: number;
  tileH: number;
  /** Parsed scale value from the inner thumb-content's computed transform. */
  scale: number;
  /** scale * SLIDE_W — should fit inside tileW (modulo a few px). */
  scaledContentW: number;
  /** Excess of scaledContentW over tileW. >0 = content overflows. */
  overflowPx: number;
  /** Top coordinate (rounded) so the test can detect row grouping. */
  top: number;
}

describe("v0.11.20 picker sizing — every orientation × magnifier combo", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR))
      mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // Use the kitchen-sink deck — most slides, biggest stress on the
    // strip's scrolling + layout.
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/07-kitchen-sink.md");
      if (file) {
        // @ts-expect-error — openFile accepts a TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    });
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
    // Give the picker iframe time to build + the enablePickerStrip burst
    // to land.
    await new Promise((r) => setTimeout(r, 2500));
  });

  /**
   * Write a value into the plugin's settings + save. Forces the picker
   * to re-init with the new orientation / tile width.
   */
  async function setSettings(
    orientation: Orientation,
    tileSizePx: number
  ): Promise<void> {
    await browser.executeObsidian(
      async ({ app }, args: { orient: string; tile: number }) => {
        // @ts-expect-error — plugins is internal
        const plugin = app.plugins.plugins["slides-ng"];
        if (!plugin) throw new Error("slides-ng plugin not loaded");
        plugin.settings.speakerPickerOrientation = args.orient;
        plugin.settings.speakerPickerTileWidth = args.tile;
        if (typeof plugin.saveSettings === "function") {
          await plugin.saveSettings();
        }
      },
      { orient: orientation, tile: tileSizePx }
    );
  }

  /**
   * Force the picker iframe to rebuild with the current settings. The
   * speaker view normally only re-issues enablePickerStrip when the
   * picker buttons are clicked. For the test we want a clean reset, so
   * we drop the cached path/mtime and re-render the picker iframe via
   * the speaker view's public method (if exposed) or via clearing the
   * cache directly. The simplest reliable trigger: close and re-open
   * the speaker view.
   */
  async function rebuildPicker(): Promise<void> {
    // Reach into the speaker view's iframe and post enablePickerStrip
    // directly with the current settings. We do this from the parent
    // window via postMessage to the picker iframe's contentWindow.
    await browser.execute(
      (slideW) => {
        const iframe = document.querySelector(
          ".slides-ng-speaker-picker-iframe"
        ) as HTMLIFrameElement | null;
        if (!iframe || !iframe.contentWindow) return;
        // @ts-expect-error — plugins is internal
        const plugin = (window as any).app?.plugins?.plugins?.["slides-ng"];
        const s = plugin?.settings;
        const orientation = s?.speakerPickerOrientation ?? "vertical-1";
        const tileWidth = s?.speakerPickerTileWidth ?? 0;
        const currentIdx = 0;
        iframe.contentWindow.postMessage(
          {
            type: "slides-ng-cmd",
            cmd: "enablePickerStrip",
            orientation,
            tileWidth,
            currentIdx,
          },
          "*"
        );
      },
      SLIDE_W
    );
    // Let the iframe rebuild + the per-tile ResizeObserver fire.
    await new Promise((r) => setTimeout(r, 700));
  }

  /**
   * Switch into the picker iframe, read each tile's geometry, switch back.
   */
  async function measureTiles(): Promise<TileGeom[]> {
    const iframe = await browser.$(".slides-ng-speaker-picker-iframe");
    await iframe.waitForExist({ timeout: 5000 });
    await browser.switchFrame(iframe);
    try {
      const tiles = await browser.execute(() => {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>(".slides-ng-picker-tile")
        );
        return els.map((t, i) => {
          const w = t.clientWidth;
          const h = t.clientHeight;
          const rect = t.getBoundingClientRect();
          const content = t.querySelector<HTMLElement>(
            ".slides-ng-picker-thumb-content"
          );
          let scale = 1;
          if (content) {
            const computed = getComputedStyle(content);
            const matrix = computed.transform;
            // "matrix(a, b, c, d, tx, ty)" → scale = a (for non-rotated)
            const m = /matrix\(([^,]+),/.exec(matrix);
            if (m) scale = parseFloat(m[1]);
          }
          return {
            idx: i,
            tileW: w,
            tileH: h,
            scale,
            top: Math.round(rect.top),
          };
        });
      });
      return tiles.map((t) => {
        const scaledContentW = t.scale * 960;
        return {
          ...t,
          scaledContentW,
          overflowPx: scaledContentW - t.tileW,
        };
      });
    } finally {
      await browser.switchFrame(null);
    }
  }

  // Loop body: assert that no tile's content overflows by more than 4 px,
  // screenshot the speaker view for human review.
  for (const orientation of ORIENTATIONS) {
    for (const sizeName of TILE_SIZES) {
      const tilePx = TILE_SIZE_PX[sizeName];
      it(`${orientation} × ${sizeName} (px=${tilePx}) — tiles contain their content`, async () => {
        await setSettings(orientation, tilePx);
        await rebuildPicker();
        const geoms = await measureTiles();
        // Activate the speaker tab so the screenshot captures it.
        await browser.executeObsidian(({ app }) => {
          const leaves = app.workspace.getLeavesOfType("slides-ng-speaker");
          if (leaves.length > 0) {
            // @ts-expect-error — internal API
            app.workspace.setActiveLeaf(leaves[0], { focus: false });
            app.workspace.revealLeaf(leaves[0]);
          }
        });
        await browser.saveScreenshot(
          `${SCREENSHOT_DIR}/picker-${orientation}-${sizeName}.png`
        );

        // Diagnostic: log the worst tile so failures are debuggable.
        if (geoms.length > 0) {
          const worst = geoms.reduce((a, b) =>
            b.overflowPx > a.overflowPx ? b : a
          );
          // eslint-disable-next-line no-console
          console.log(
            `[picker-sizing] ${orientation} × ${sizeName}: ` +
              `${geoms.length} tiles, worst overflow ${worst.overflowPx.toFixed(1)} px ` +
              `(tile #${worst.idx + 1}: ${worst.tileW}×${worst.tileH}, ` +
              `scale ${worst.scale.toFixed(3)}, scaled-content ${worst.scaledContentW.toFixed(1)})`
          );
        }

        // Assert each tile's content fits its tile. Tolerance accounts
        // for:
        //   - tile border (2 px each side = 4 px) — clientWidth EXCLUDES
        //     border, so the inline scale uses outer width but the
        //     measurement compares to inner. Visually the border doesn't
        //     count as content overflow since overflow:hidden clips at
        //     the content edge.
        //   - sub-pixel rounding (~1 px headroom).
        // 8 px is conservative + comfortably wider than the longest
        // observed false-positive in v0.11.21 (4 px). The actual broken
        // state in v0.11.20 was tens to hundreds of pixels.
        const TOLERANCE_PX = 8;
        for (const g of geoms) {
          if (g.overflowPx > TOLERANCE_PX) {
            throw new Error(
              `tile #${g.idx + 1} overflows by ${g.overflowPx.toFixed(1)} px ` +
                `(tileW=${g.tileW}, scale=${g.scale.toFixed(3)}, ` +
                `scaledContentW=${g.scaledContentW.toFixed(1)})`
            );
          }
          // v0.11.22b: assert tile height is in a sane range relative
          // to width. Reveal's stage aspect is 960/700 ≈ 1.37. The
          // ratio width/height should be near 1.37 (modulo border).
          // Catches the "tile compressed to 4 px tall" bug that was
          // hidden by overflow assertions alone — clientHeight = 4
          // means the tile is just its border with no content area.
          if (g.tileW > 0 && g.tileH > 0) {
            const ratio = g.tileW / g.tileH;
            if (ratio > 3.0 || ratio < 0.8) {
              throw new Error(
                `tile #${g.idx + 1} has degenerate aspect ratio ` +
                  `${ratio.toFixed(2)} (w=${g.tileW}, h=${g.tileH}) — ` +
                  `expected ~1.37 for a slide-shaped tile`
              );
            }
          } else {
            throw new Error(
              `tile #${g.idx + 1} has zero dimension ` +
                `(w=${g.tileW}, h=${g.tileH})`
            );
          }
        }
      });
    }
  }

  // v0.11.22e: current-tile flicker check. Simulates rapid tile
  // clicks (the user-reported "flips back and forth to the previous
  // slide for a second" bug). Installs a MutationObserver inside the
  // picker iframe that records every `.current` class transition,
  // then triggers two clicks 500 ms apart and inspects the transition
  // log after a 3 s settle. Without v0.11.21's burst-timer cancellation,
  // the first click's stale `setPickerCurrent` posts overwrite the
  // second click's highlight repeatedly over the 2.5 s burst window —
  // each overwrite shows up as an extra "added" transition.
  describe("current-tile indicator stability", function () {
    it("rapid sequential clicks settle without flicker", async () => {
      // Reset to a known orientation + size so tile #0 is current.
      await browser.executeObsidian(async ({ app }) => {
        // @ts-expect-error — plugins is internal
        const plugin = app.plugins.plugins["slides-ng"];
        if (!plugin) return;
        plugin.settings.speakerPickerOrientation = "vertical-1";
        plugin.settings.speakerPickerTileWidth = 0;
        if (typeof plugin.saveSettings === "function") {
          await plugin.saveSettings();
        }
      });
      await new Promise((r) => setTimeout(r, 800));
      // Install the flicker recorder inside the picker iframe.
      const iframe = await browser.$(".slides-ng-speaker-picker-iframe");
      await iframe.waitForExist({ timeout: 5000 });
      await browser.switchFrame(iframe);
      try {
        await browser.execute(() => {
          interface FlickerEntry {
            t: number;
            idx: number;
            added: boolean;
          }
          const log: FlickerEntry[] = [];
          const tiles = document.querySelectorAll<HTMLElement>(
            ".slides-ng-picker-tile"
          );
          const ro = new MutationObserver((mutations) => {
            for (const m of mutations) {
              if (m.type !== "attributes" || m.attributeName !== "class")
                continue;
              const t = m.target as HTMLElement;
              const idx = parseInt(t.getAttribute("data-slide-idx") || "0", 10);
              const wasCurrent =
                (m.oldValue || "").indexOf("current") !== -1;
              const isCurrent = t.classList.contains("current");
              if (wasCurrent !== isCurrent) {
                log.push({ t: performance.now(), idx, added: isCurrent });
              }
            }
          });
          tiles.forEach((tile) => {
            ro.observe(tile, {
              attributes: true,
              attributeOldValue: true,
              attributeFilter: ["class"],
            });
          });
          (window as unknown as { __slidesNgFlicker: FlickerEntry[] }).__slidesNgFlicker = log;
        });
      } finally {
        await browser.switchFrame(null);
      }
      // Simulate two rapid tile clicks (idx 5, then idx 10).
      await browser.execute(() => {
        window.postMessage(
          { type: "slides-ng-picker", event: "click", idx: 5 },
          "*"
        );
      });
      await new Promise((r) => setTimeout(r, 500));
      await browser.execute(() => {
        window.postMessage(
          { type: "slides-ng-picker", event: "click", idx: 10 },
          "*"
        );
      });
      // Wait longer than the full burst window (2.5 s) so any stale
      // posts have a chance to land.
      await new Promise((r) => setTimeout(r, 3000));
      // Read the flicker log from the iframe.
      let log: Array<{ t: number; idx: number; added: boolean }> = [];
      await browser.switchFrame(iframe);
      try {
        const raw = await browser.execute(
          () =>
            (window as unknown as { __slidesNgFlicker?: unknown[] })
              .__slidesNgFlicker ?? []
        );
        if (Array.isArray(raw)) log = raw as typeof log;
      } finally {
        await browser.switchFrame(null);
      }
      const addedTransitions = log
        .filter((e) => e.added)
        .map((e) => e.idx);
      // eslint-disable-next-line no-console
      console.log(
        `[picker-flicker] added transitions: [${addedTransitions.join(", ")}], total events: ${log.length}`
      );
      // Healthy: at most 2 distinct "added" events (one per click).
      // Each click should add `.current` to at most one tile, and we
      // allow one extra in case the initial-state add registers.
      // Flicker case: same idx gets added repeatedly as stale bursts
      // ping-pong the highlight.
      if (addedTransitions.length > 4) {
        throw new Error(
          `Suspected flicker — saw ${addedTransitions.length} ` +
            `.current additions for 2 clicks (sequence: ` +
            `${addedTransitions.join(", ")}). Burst-timer ` +
            `cancellation (v0.11.21) regressed.`
        );
      }
      // Sanity: final state should be tile 10 (last clicked).
      const lastAdded = addedTransitions[addedTransitions.length - 1];
      if (lastAdded !== 10) {
        throw new Error(
          `Expected final .current = tile 10, got tile ${lastAdded} ` +
            `(sequence: ${addedTransitions.join(", ")})`
        );
      }
    });
  });

  // v0.11.22c: viewport-responsiveness check. Forces a width change
  // on the picker iframe's CONTAINER and re-measures — confirms the
  // in-iframe ResizeObserver hook fires and applyPickerStripLayout
  // re-runs with the new strip width. Catches regressions where the
  // picker stops adapting to speaker-pane resizes.
  describe("viewport-responsiveness", function () {
    it("reflows tile geometry when the picker container width changes", async () => {
      // Settle into auto-fit with the comfortable preset so column
      // count meaningfully changes between narrow and wide containers.
      await browser.executeObsidian(async ({ app }) => {
        // @ts-expect-error — plugins is internal
        const plugin = app.plugins.plugins["slides-ng"];
        if (!plugin) return;
        plugin.settings.speakerPickerOrientation = "auto";
        plugin.settings.speakerPickerTileWidth = 180;
        if (typeof plugin.saveSettings === "function") {
          await plugin.saveSettings();
        }
      });
      // Force two distinct container widths and check tile geometry
      // updates for each.
      const widths = [200, 700];
      const observedColCounts: number[] = [];
      for (const w of widths) {
        await browser.execute((targetW: number) => {
          const container = document.querySelector(
            ".slides-ng-speaker-picker-thumbs"
          ) as HTMLElement | null;
          if (!container) return;
          container.style.maxWidth = `${targetW}px`;
          container.style.width = `${targetW}px`;
        }, w);
        // v0.11.22d: DO NOT re-issue enablePickerStrip here. The
        // whole point of this test is that the strip RO inside the
        // iframe re-runs applyPickerStripLayout on its own when the
        // container resizes. If we manually re-issue, we'd be testing
        // the cycle-orientation path (which already works for the
        // user) and missing the real bug: layout doesn't follow
        // viewport changes "on the fly".
        await new Promise((r) => setTimeout(r, 1200));
        const geoms = await measureTiles();
        // Count column count by grouping tiles with identical (rounded)
        // top coordinate. Each tile reports `top` from inside the
        // iframe via measureTiles (the parent-context queries can't
        // reach into a sandboxed iframe).
        const yBuckets = new Set<number>();
        for (const g of geoms) yBuckets.add(g.top);
        const colsObserved = geoms.length / Math.max(1, yBuckets.size);
        observedColCounts.push(Math.round(colsObserved));
        // eslint-disable-next-line no-console
        console.log(
          `[picker-sizing] viewport ${w}px: ${geoms.length} tiles, ` +
            `${yBuckets.size} rows, ~${colsObserved.toFixed(1)} cols`
        );
        await browser.saveScreenshot(
          `${SCREENSHOT_DIR}/responsive-${w}px.png`
        );
      }
      // Restore: clean up inline overrides so other suites aren't affected.
      await browser.execute(() => {
        const container = document.querySelector(
          ".slides-ng-speaker-picker-thumbs"
        ) as HTMLElement | null;
        if (container) {
          container.style.maxWidth = "";
          container.style.width = "";
        }
      });
      // Assert reflow actually changed column count. With comfortable
      // (180 px) preset: at 200 px container → 1 col; at 700 px → 3 cols.
      if (observedColCounts[0] === observedColCounts[1]) {
        throw new Error(
          `Picker did not reflow on viewport change — ` +
            `same column count at 200 px and 700 px ` +
            `(${observedColCounts.join(", ")})`
        );
      }
    });
  });
});
