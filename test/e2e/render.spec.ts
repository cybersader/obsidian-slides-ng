/**
 * M2 render spec — proves the renderer pipeline works inside real
 * Obsidian: open a markdown deck, run the open-preview command, switch
 * into the iframe, assert reveal.js mounted the expected number of
 * slides, and capture a screenshot to test-results/.
 *
 * Per the workspace standing rule (.claude/skills/testing-patterns/SKILL.md):
 * UX-relevant features ship with WDIO + screenshot coverage, not just
 * unit tests.
 */

import {
  switchToSlideFrame,
  switchToTop,
  waitForSlides,
} from "./helpers/iframe";
import { mkdirSync, existsSync } from "fs";

declare const browser: WebdriverIO.Browser;

interface ObsidianApp {
  workspace: {
    layoutReady: boolean;
    getLeaf: (newLeaf: boolean) => {
      openFile: (file: unknown) => Promise<void>;
    };
  };
  vault: {
    getAbstractFileByPath: (path: string) => unknown;
  };
  plugins: { plugins: Record<string, unknown> };
  commands: { executeCommandById: (id: string) => Promise<unknown> | unknown };
}

declare global {
  interface Window {
    app: ObsidianApp;
  }
}

const SCREENSHOT_DIR = "./test-results";

describe("slides-ng renders the example deck", () => {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) {
      mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    // Wait for Obsidian to fully load + plugin to register.
    await browser.waitUntil(
      async () =>
        (await browser.execute(
          () => window.app?.workspace?.layoutReady === true
        )) === true,
      { timeout: 30000, timeoutMsg: "Obsidian workspace did not become ready" }
    );

    await browser.waitUntil(
      async () =>
        (await browser.execute(
          () => !!window.app?.plugins?.plugins?.["slides-ng"]
        )) === true,
      { timeout: 15000, timeoutMsg: "slides-ng plugin did not load" }
    );

    // Open the seed example deck as the active markdown file.
    const opened = await browser.execute(async (path: string) => {
      const file = window.app.vault.getAbstractFileByPath(path);
      if (!file) return false;
      await window.app.workspace.getLeaf(false).openFile(file);
      return true;
    }, "Decks/example.md");
    if (!opened) throw new Error("could not open Decks/example.md");

    // Run the slides-ng:open-preview command.
    await browser.execute(() =>
      window.app.commands.executeCommandById("slides-ng:open-preview")
    );
  });

  it("renders the deck as reveal.js sections inside the iframe", async () => {
    await switchToSlideFrame();
    try {
      // Decks/example.md has 6 slides + 1 vertical auto-animate sub-slide
      // = at least 6 top-level horizontal sections rendered by reveal.js.
      await waitForSlides(6, 8000);

      const sectionCount = await browser.execute(
        () => document.querySelectorAll(".reveal section").length
      );
      expect(sectionCount).toBeGreaterThanOrEqual(6);

      // Reveal must have actually initialized (mounts a `.present` slide).
      const hasPresent = await browser.execute(
        () => document.querySelectorAll(".reveal section.present").length > 0
      );
      expect(hasPresent).toBe(true);
    } finally {
      await switchToTop();
    }
  });

  it("captures a screenshot of the rendered preview", async () => {
    // Top-level shot — Obsidian frame + slides-ng iframe + first slide.
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/m2-example-deck-frame.png`);

    // Inside-iframe shot — just the slide content as reveal.js drew it.
    await switchToSlideFrame();
    try {
      await browser.saveScreenshot(`${SCREENSHOT_DIR}/m2-example-deck-slide.png`);
    } finally {
      await switchToTop();
    }
  });
});
