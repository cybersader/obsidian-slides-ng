/**
 * render.spec.ts — M2 visual + integration test.
 *
 * Opens Decks/example.md, runs slides-ng:open-preview, switches into the
 * srcdoc iframe, asserts reveal.js mounted the expected sections, and
 * captures screenshots to test-results/.
 *
 * Per the workspace standing rule (`.claude/skills/testing-patterns/`):
 * UX features ship with WDIO + screenshot coverage, not just unit tests.
 */

import { browser, $ } from "@wdio/globals";
import { expect } from "expect";
import {
  switchToSlideFrame,
  switchToTop,
  waitForSlides,
  SLIDE_IFRAME_SELECTOR,
} from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results";

describe("slides-ng renders the example deck", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // Open the seed example deck as the active markdown file.
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/example.md");
      if (file) {
        // @ts-expect-error — openFile accepts a TFile; runtime types differ from public typings
        await app.workspace.getLeaf(false).openFile(file);
      }
    });

    // Run the open-preview command.
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — executeCommandById is internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });

    // Wait for the SlidesNG view leaf to exist.
    await browser.waitUntil(
      async () => {
        const count = await browser.executeObsidian(
          ({ app }) => app.workspace.getLeavesOfType("slides-ng-preview").length
        );
        return count > 0;
      },
      { timeout: 10000, timeoutMsg: "slides-ng preview leaf never opened" }
    );
  });

  it("reveal.js mounts ≥6 sections from the example deck", async () => {
    await switchToSlideFrame();
    try {
      // Decks/example.md has 6 horizontal slides + 1 vertical auto-animate.
      await waitForSlides(6, 8000);

      const sectionCount = await browser.execute(
        () => document.querySelectorAll(".reveal section").length
      );
      expect(sectionCount).toBeGreaterThanOrEqual(6);

      const hasPresent = await browser.execute(
        () => document.querySelectorAll(".reveal section.present").length > 0
      );
      expect(hasPresent).toBe(true);
    } finally {
      await switchToTop();
    }
  });

  it("captures screenshots of the rendered preview", async () => {
    // Full Obsidian window — shows the editor + slides-ng iframe in context.
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/m2-example-deck-frame.png`);

    // Just the iframe element's bounding box — gives a clean shot of what
    // reveal.js drew without the surrounding Obsidian chrome. `browser.saveScreenshot`
    // is always full-window even after switchFrame, so we use element-level
    // saveScreenshot here for the iframe-only view.
    const iframe = await $(SLIDE_IFRAME_SELECTOR);
    await iframe.saveScreenshot(`${SCREENSHOT_DIR}/m2-example-deck-slide.png`);
  });
});
