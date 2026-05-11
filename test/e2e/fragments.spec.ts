/**
 * fragments.spec.ts — M4 visual + integration test.
 *
 * Opens Decks/example.md (which already contains a <v-clicks> block and
 * a typescript code fence), drills into the slides iframe, and asserts
 * that reveal.js sees:
 *   - at least one `.fragment` element (from <v-clicks>)
 *   - at least one `.shiki` code block (Shiki syntax highlighting)
 *
 * Plus screenshots of the rendered v-clicks slide and the code-block
 * slide so a reviewer can see the actual highlighting.
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

describe("slides-ng renders Slidev-flavoured fragments + Shiki", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/example.md");
      if (file) {
        // @ts-expect-error — openFile accepts a TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    });
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — executeCommandById is internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });
    await browser.waitUntil(
      async () => {
        const n = await browser.executeObsidian(
          ({ app }) => app.workspace.getLeavesOfType("slides-ng-preview").length
        );
        return n > 0;
      },
      { timeout: 10000, timeoutMsg: "slides-ng preview leaf never opened" }
    );
  });

  it("v-clicks block produces .fragment elements in reveal.js DOM", async () => {
    await switchToSlideFrame();
    try {
      await waitForSlides(6, 8000);
      const fragmentCount = await browser.execute(
        () => document.querySelectorAll(".reveal .fragment").length
      );
      // Example deck has <v-clicks>...3 bullets...</v-clicks>; expect ≥3.
      expect(fragmentCount).toBeGreaterThanOrEqual(3);
    } finally {
      await switchToTop();
    }
  });

  it("code blocks render with Shiki highlighting (.shiki class present)", async () => {
    await switchToSlideFrame();
    try {
      const shikiCount = await browser.execute(
        () => document.querySelectorAll(".reveal pre.shiki, .reveal .shiki").length
      );
      // Example deck has one ts code fence; expect ≥1 shiki block.
      expect(shikiCount).toBeGreaterThanOrEqual(1);

      // And the tokens inside should be span-styled (otherwise Shiki
      // emitted a plaintext block — silent failure mode).
      const styledTokenCount = await browser.execute(
        () => document.querySelectorAll(".reveal .shiki span[style*=\"color\"]").length
      );
      expect(styledTokenCount).toBeGreaterThan(0);
    } finally {
      await switchToTop();
    }
  });

  it("captures M4 screenshots (frame + iframe)", async () => {
    // Full Obsidian window — editor on left, slides-ng iframe on right.
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/m4-example-deck-frame.png`);

    // Iframe-element screenshot — just what reveal.js drew on the
    // current slide, no Obsidian chrome.
    const iframe = await $(SLIDE_IFRAME_SELECTOR);
    await iframe.saveScreenshot(`${SCREENSHOT_DIR}/m4-example-deck-slide.png`);
  });

  it("captures the v-clicks slide and the code-block slide", async () => {
    // Render each slide standalone via a temp deck that contains only
    // that slide, so the screenshots show v-clicks and Shiki output
    // without needing to navigate inside reveal.js (Reveal.slide()
    // doesn't reliably advance inside an `embedded: true` iframe from
    // an external script context).
    const vclicksDeck = `---\ntheme: simple\n---\n\n# v-clicks demo\n\n<v-clicks>\n\n- One\n- Two\n- Three\n\n</v-clicks>\n`;
    const codeDeck = `---\ntheme: simple\n---\n\n# Shiki demo\n\n\`\`\`ts [1|2-3|all]\nconst passphrase = "four random words"\nconst length = passphrase.split(" ").length\nconsole.log(\`length is \${length}\`)\n\`\`\`\n`;

    for (const [name, content] of [
      ["m4-vclicks-slide.png", vclicksDeck],
      ["m4-shiki-slide.png", codeDeck],
    ] as const) {
      await browser.executeObsidian(async ({ app }) => {
        const path = "Decks/__m4_screenshot__.md";
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) {
          // @ts-expect-error — TFile at runtime
          await app.vault.delete(existing);
        }
      });

      await browser.executeObsidian(
        async ({ app }, { path, body }: { path: string; body: string }) => {
          // @ts-expect-error — create returns TFile at runtime
          await app.vault.create(path, body);
          const file = app.vault.getAbstractFileByPath(path);
          // @ts-expect-error — openFile accepts TFile at runtime
          await app.workspace.getLeaf(false).openFile(file);
        },
        { path: "Decks/__m4_screenshot__.md", body: content }
      );

      await browser.executeObsidian(({ app }) => {
        // @ts-expect-error — internal API
        app.commands.executeCommandById("slides-ng:open-preview");
      });
      await browser.pause(700); // wait for parse + render + iframe paint

      const iframe = await $(SLIDE_IFRAME_SELECTOR);
      await iframe.saveScreenshot(`${SCREENSHOT_DIR}/${name}`);
    }

    // Tidy up: remove the temp deck so it doesn't pollute future runs.
    await browser.executeObsidian(async ({ app }) => {
      const path = "Decks/__m4_screenshot__.md";
      const f = app.vault.getAbstractFileByPath(path);
      if (f) {
        // @ts-expect-error — delete accepts TFile at runtime
        await app.vault.delete(f);
      }
    });
  });
});
