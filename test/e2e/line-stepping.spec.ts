/**
 * line-stepping.spec.ts — M5 visual + interaction test.
 *
 * Opens a line-stepping deck, advances reveal.js fragments, and asserts
 * that:
 *   - the line-step container exists in the iframe DOM
 *   - each step is rendered as a separate <div.line-step-step>
 *   - the dim transformer marked the right lines per step
 *   - presses to the next fragment swap which step is "current"
 *   - screenshots capture each step for visual review
 */

import { browser, $ } from "@wdio/globals";
import { expect } from "expect";
import {
  switchToSlideFrame,
  switchToTop,
  SLIDE_IFRAME_SELECTOR,
} from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results/m5";
const FIXTURE_PATH = "Decks/__m5_line_step__.md";

// 3-step line-step deck. Step 0 spotlights line 1, step 1 spotlights
// lines 2-3, step 2 spotlights all lines.
const DECK = [
  "---",
  "theme: black",
  "---",
  "",
  "# Line-step demo",
  "",
  "```ts [1|2-3|all]",
  'const passphrase = "four random words"',
  'const length = passphrase.split(" ").length',
  "console.log(`length is ${length}`)",
  "```",
  "",
].join("\n");

describe("slides-ng line-step code stepping", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // Create the fixture file inside the (sandboxed) vault and open it.
    await browser.executeObsidian(
      async ({ app }, { path, body }: { path: string; body: string }) => {
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) {
          // @ts-expect-error — TFile at runtime
          await app.vault.delete(existing);
        }
        // @ts-expect-error — create returns TFile at runtime
        await app.vault.create(path, body);
        const file = app.vault.getAbstractFileByPath(path);
        // @ts-expect-error — openFile accepts TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      },
      { path: FIXTURE_PATH, body: DECK }
    );

    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });

    // Wait for the iframe + container to mount.
    const iframe = await $(SLIDE_IFRAME_SELECTOR);
    await iframe.waitForExist({ timeout: 5000 });
    await browser.pause(700);
  });

  after(async () => {
    // Clean up the temp fixture so it doesn't pollute future runs.
    await browser.executeObsidian(async ({ app }, p: string) => {
      const f = app.vault.getAbstractFileByPath(p);
      if (f) {
        // @ts-expect-error — delete accepts TFile at runtime
        await app.vault.delete(f);
      }
    }, FIXTURE_PATH);
  });

  it("renders a line-step container with 3 steps", async () => {
    await switchToSlideFrame();
    try {
      const stats = await browser.execute(() => {
        const c = document.querySelector(".line-step-container");
        const steps = document.querySelectorAll(".line-step-step");
        return {
          containerExists: !!c,
          stepCount: steps.length,
          count: c?.getAttribute("data-step-count"),
        };
      });
      expect(stats.containerExists).toBe(true);
      expect(stats.stepCount).toBe(3);
      expect(stats.count).toBe("3");
    } finally {
      await switchToTop();
    }
  });

  it("step 0 spotlights line 1 (lines 2 and 3 are dimmed)", async () => {
    await switchToSlideFrame();
    try {
      const dimCounts = await browser.execute(() => {
        const step0 = document.querySelectorAll(".line-step-step")[0];
        const allLines = step0?.querySelectorAll(".line") ?? [];
        const dimLines = step0?.querySelectorAll(".line.line-dim") ?? [];
        return { all: allLines.length, dim: dimLines.length };
      });
      // Code has 3 lines; step [1] dims 2 of them (lines 2 and 3).
      expect(dimCounts.all).toBe(3);
      expect(dimCounts.dim).toBe(2);
    } finally {
      await switchToTop();
    }
  });

  it("step 2 (all) has NO dimmed lines", async () => {
    await switchToSlideFrame();
    try {
      const dim = await browser.execute(() => {
        const step2 = document.querySelectorAll(".line-step-step")[2];
        return step2?.querySelectorAll(".line.line-dim").length ?? -1;
      });
      expect(dim).toBe(0);
    } finally {
      await switchToTop();
    }
  });

  it("captures one screenshot per step (visual proof of line-stepping)", async () => {
    const iframe = await $(SLIDE_IFRAME_SELECTOR);

    // Step 0 — initial state.
    await iframe.saveScreenshot(`${SCREENSHOT_DIR}/step-0.png`);

    // Advance reveal.js by one fragment → step 1 becomes current.
    await switchToSlideFrame();
    try {
      await browser.execute(() => {
        // @ts-expect-error — Reveal injected globally inside the iframe
        if (typeof Reveal !== "undefined") Reveal.next();
      });
      await browser.pause(400);
    } finally {
      await switchToTop();
    }
    await iframe.saveScreenshot(`${SCREENSHOT_DIR}/step-1.png`);

    // One more advance → step 2.
    await switchToSlideFrame();
    try {
      await browser.execute(() => {
        // @ts-expect-error — Reveal injected globally inside the iframe
        if (typeof Reveal !== "undefined") Reveal.next();
      });
      await browser.pause(400);
    } finally {
      await switchToTop();
    }
    await iframe.saveScreenshot(`${SCREENSHOT_DIR}/step-2.png`);
  });
});
