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

  it("auto-animate is visually present on round 1 (steelblue box rendered)", async () => {
    // We can advance reveal.js ONE step from outside the iframe by
    // clicking it for focus + sending ArrowRight; subsequent keys lose
    // focus and don't reach reveal.js's listener (iframe sandbox is
    // `allow-scripts` only, no `allow-same-origin`, so we can't poke at
    // contentWindow.Reveal either). For full back-to-back auto-animate
    // verification, eyeball the deck in real Obsidian — this E2E only
    // proves the first auto-animate slide renders with its data-id box.
    const iframe = await $(SLIDE_IFRAME_SELECTOR);
    await iframe.click();
    await browser.pause(200);
    await browser.keys(["ArrowRight"]);
    await browser.pause(800);
    await iframe.saveScreenshot(`${SCREENSHOT_DIR}/auto-animate-round-1.png`);

    // Sanity assertion via DOM: both auto-animate sections exist in the
    // tree with their data-id boxes (and the right inline backgrounds).
    // We don't assert which section is currently `.present` — reveal's
    // behaviour around `.present` in embedded mode is timing-dependent.
    await switchToSlideFrame();
    try {
      const info = await browser.execute(() => {
        const sections = Array.from(
          document.querySelectorAll(".reveal section[data-auto-animate]")
        ) as HTMLElement[];
        return sections.map((s) => {
          const box = s.querySelector('[data-id="box"]') as HTMLElement | null;
          return {
            hasBox: !!box,
            boxBg: box?.style.background ?? "",
          };
        });
      });
      expect(info.length).toBeGreaterThanOrEqual(2);
      expect(info[0].hasBox).toBe(true);
      expect(info[0].boxBg).toContain("steelblue");
      expect(info[1].hasBox).toBe(true);
      expect(info[1].boxBg).toContain("tomato");
    } finally {
      await switchToTop();
    }
  });
});
