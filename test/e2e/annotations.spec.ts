/**
 * annotations.spec.ts — verifies that v0.3 slide + element annotations
 * actually land in the rendered iframe DOM:
 *   - `<!-- slide data-auto-animate -->` → `<section data-auto-animate>`
 *   - `<!-- slide class="X" -->` → `<section class="X">`
 *   - `<!-- element class="fragment" -->` after a `<p>` → `<p class="fragment">`
 *
 * Plus visual proof — screenshot of the auto-animate slide.
 */

import { browser, $ } from "@wdio/globals";
import { expect } from "expect";
import {
  switchToSlideFrame,
  switchToTop,
  SLIDE_IFRAME_SELECTOR,
} from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results/annotations";

describe("slides-ng annotations (v0.3)", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/fixtures/14-annotations.md");
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
    await browser.pause(700);
  });

  it("at least two sections carry data-auto-animate", async () => {
    await switchToSlideFrame();
    try {
      const count = await browser.execute(
        () => document.querySelectorAll(".reveal section[data-auto-animate]").length
      );
      expect(count).toBeGreaterThanOrEqual(2);
    } finally {
      await switchToTop();
    }
  });

  it("a section has the custom class from `<!-- slide class -->`", async () => {
    await switchToSlideFrame();
    try {
      const found = await browser.execute(
        () => document.querySelectorAll(".reveal section.custom-slide").length
      );
      expect(found).toBeGreaterThanOrEqual(1);
    } finally {
      await switchToTop();
    }
  });

  it("element annotation produced .fragment paragraphs", async () => {
    await switchToSlideFrame();
    try {
      const fragments = await browser.execute(
        () => document.querySelectorAll(".reveal p.fragment").length
      );
      // The fixture has 2 paragraphs with element class="fragment".
      expect(fragments).toBeGreaterThanOrEqual(2);
    } finally {
      await switchToTop();
    }
  });

  it("auto-animate-paired data-id elements survive into DOM", async () => {
    await switchToSlideFrame();
    try {
      const boxes = await browser.execute(
        () => document.querySelectorAll('.reveal [data-id="box"]').length
      );
      // 2 sections, each with a `data-id="box"` div.
      expect(boxes).toBeGreaterThanOrEqual(2);
    } finally {
      await switchToTop();
    }
  });

  it("captures a screenshot of the annotated deck", async () => {
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/v03-annotations-frame.png`);
    const iframe = await $(SLIDE_IFRAME_SELECTOR);
    await iframe.saveScreenshot(`${SCREENSHOT_DIR}/v03-annotations-slide.png`);
  });
});
