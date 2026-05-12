/**
 * magic-move.spec.ts — v0.4 magic-move integration test.
 *
 * Verifies that:
 *   - the renderer emits `.slides-ng-magic-move` marker elements
 *   - paired blocks share the same `data-mm-key`
 *   - the iframe-side bootstrap initializes a MagicMoveRenderer (i.e.
 *     window.SlidesNgMagicMove is exposed)
 *   - non-paired code blocks remain plain Shiki blocks
 */

import { browser, $ } from "@wdio/globals";
import { expect } from "expect";
import {
  switchToSlideFrame,
  switchToTop,
  SLIDE_IFRAME_SELECTOR,
} from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results/magic-move";

describe("slides-ng magic-move", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/fixtures/15-magic-move.md");
      if (file) {
        // @ts-expect-error — TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    });
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });

    const iframe = await $(SLIDE_IFRAME_SELECTOR);
    await iframe.waitForExist({ timeout: 5000 });
    await browser.pause(900);
  });

  it("emits magic-move marker elements with data-mm-key attrs", async () => {
    await switchToSlideFrame();
    try {
      const info = await browser.execute(() => {
        const markers = Array.from(
          document.querySelectorAll(".slides-ng-magic-move")
        ) as HTMLElement[];
        return markers.map((el) => ({
          key: el.getAttribute("data-mm-key"),
          lang: el.getAttribute("data-mm-lang"),
          hasTokens: !!el.getAttribute("data-mm-tokens"),
        }));
      });
      // Fixture has 3 paired blocks with key=passphrase + 1 block with key=other.
      expect(info.length).toBeGreaterThanOrEqual(4);
      const passphraseKeys = info.filter((i) => i.key === "passphrase");
      expect(passphraseKeys.length).toBe(3);
      expect(passphraseKeys.every((i) => i.hasTokens)).toBe(true);
    } finally {
      await switchToTop();
    }
  });

  it("plain ts block (no key=) stays as a `.shiki` block; magic-move blocks take over their containers", async () => {
    await switchToSlideFrame();
    try {
      // The fixture has:
      //   - 3 blocks with key=passphrase (paired, magic-move)
      //   - 1 plain ts block (no key, regular shiki)
      //   - 1 block with key=other (magic-move)
      // After the iframe bootstrap runs, each magic-move marker's
      // initial Shiki content gets replaced by the MagicMoveRenderer's
      // DOM, so `.reveal .shiki` only matches the plain block.
      const counts = await browser.execute(() => {
        return {
          shikiBlocksOutsideMagicMove: Array.from(
            document.querySelectorAll(".reveal .shiki")
          ).filter((el) => !el.closest(".slides-ng-magic-move")).length,
          magicMoveBlocks: document.querySelectorAll(".reveal .slides-ng-magic-move")
            .length,
        };
      });
      expect(counts.shikiBlocksOutsideMagicMove).toBeGreaterThanOrEqual(1);
      expect(counts.magicMoveBlocks).toBeGreaterThanOrEqual(4);
    } finally {
      await switchToTop();
    }
  });

  it("the shiki-magic-move runtime is loaded inside the iframe", async () => {
    await switchToSlideFrame();
    try {
      const loaded = await browser.execute(() => {
        const w = window as unknown as {
          SlidesNgMagicMove?: { MagicMoveRenderer: unknown };
        };
        return {
          hasGlobal: !!w.SlidesNgMagicMove,
          hasRenderer: typeof w.SlidesNgMagicMove?.MagicMoveRenderer === "function",
        };
      });
      expect(loaded.hasGlobal).toBe(true);
      expect(loaded.hasRenderer).toBe(true);
    } finally {
      await switchToTop();
    }
  });

  it("captures a screenshot of the magic-move deck", async () => {
    const iframe = await $(SLIDE_IFRAME_SELECTOR);
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/v04-magic-move-frame.png`);
    await iframe.saveScreenshot(`${SCREENSHOT_DIR}/v04-magic-move-slide.png`);
  });
});
