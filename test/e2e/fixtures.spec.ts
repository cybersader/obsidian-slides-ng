/**
 * fixtures.spec.ts — M4.5 visual coverage.
 *
 * Loops over every fixture under Decks/fixtures/ and:
 *   1. Opens it in the active editor
 *   2. Runs slides-ng:open-preview
 *   3. Waits for the iframe to render
 *   4. Captures an iframe-only screenshot to test-results/fixtures/
 *
 * The DOM assertions live in tests/fixtures.test.ts (fast unit tests).
 * This spec exists to give a human reviewer one screenshot per feature
 * category — pixels through the real Obsidian → iframe → reveal.js
 * stack — without any clever fragment navigation. First-slide-only is
 * enough for visual smoke; deeper navigation lives in the per-feature
 * specs (fragments, save-watch, etc.).
 */

import { browser, $ } from "@wdio/globals";
import { SLIDE_IFRAME_SELECTOR } from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results/fixtures";

const FIXTURES = [
  "01-basic.md",
  "02-frontmatter-simple.md",
  "02b-frontmatter-black.md",
  "03-transitions.md",
  "04-vertical-slides.md",
  "05-v-click.md",
  "06-v-clicks.md",
  "07-shiki-langs.md",
  "08-shiki-line-step.md",
  "09-speaker-notes.md",
  "10-tables-blockquotes.md",
  "11-inline-html.md",
  "12-edge-cases.md",
  "13-layouts.md",
  "14-annotations.md",
  "15-magic-move.md",
] as const;

describe("slides-ng renders each feature-coverage fixture", function () {
  before(() => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  for (const filename of FIXTURES) {
    it(`renders Decks/fixtures/${filename}`, async () => {
      const path = `Decks/fixtures/${filename}`;

      await browser.executeObsidian(
        async ({ app }, p: string) => {
          const file = app.vault.getAbstractFileByPath(p);
          if (!file) throw new Error("fixture not found: " + p);
          // @ts-expect-error — openFile accepts a TFile at runtime
          await app.workspace.getLeaf(false).openFile(file);
        },
        path
      );

      await browser.executeObsidian(({ app }) => {
        // @ts-expect-error — internal API
        app.commands.executeCommandById("slides-ng:open-preview");
      });

      // Wait for the iframe to mount + reveal.js to paint at least one
      // section. Some fixtures have edge content (empty slides, raw HTML)
      // so we don't assert section count — just that the iframe is live.
      const iframe = await $(SLIDE_IFRAME_SELECTOR);
      await iframe.waitForExist({ timeout: 5000 });
      await browser.pause(500);

      const out = `${SCREENSHOT_DIR}/${filename.replace(/\.md$/, ".png")}`;
      await iframe.saveScreenshot(out);
    });
  }
});
