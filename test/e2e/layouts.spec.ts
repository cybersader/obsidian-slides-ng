/**
 * layouts.spec.ts — Slidev-style layouts visual + DOM coverage.
 *
 * For each layout in the 13-layouts.md fixture: assert the layout
 * wrapper landed in the iframe DOM with the right data-layout attr,
 * and screenshot each slide so a reviewer can eyeball the visual.
 */

import { browser, $ } from "@wdio/globals";
import { expect } from "expect";
import {
  switchToSlideFrame,
  switchToTop,
  SLIDE_IFRAME_SELECTOR,
} from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results/layouts";

const FIXTURE = "Decks/fixtures/13-layouts.md";

// Order matches the fixture; each entry = (slide index, layout name).
const SLIDES: ReadonlyArray<[number, string]> = [
  [0, "cover"],
  [1, "center"],
  [2, "two-cols"],
  [3, "two-cols-header"],
  [4, "quote"],
  [5, "statement"],
  [6, "section"],
  [7, "end"],
];

describe("slides-ng Slidev layouts", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    await browser.executeObsidian(async ({ app }, p: string) => {
      const file = app.vault.getAbstractFileByPath(p);
      if (file) {
        // @ts-expect-error — TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    }, FIXTURE);

    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });

    const iframe = await $(SLIDE_IFRAME_SELECTOR);
    await iframe.waitForExist({ timeout: 5000 });
    await browser.pause(700);
  });

  it("renders 8 slides, one per layout", async () => {
    await switchToSlideFrame();
    try {
      const wrappers = await browser.execute(() => {
        const els = Array.from(
          document.querySelectorAll(".slides-ng-layout")
        ) as HTMLElement[];
        return els.map((el) => el.getAttribute("data-layout") ?? "");
      });
      expect(wrappers.length).toBeGreaterThanOrEqual(8);
      // Each known layout name appears at least once.
      for (const [, name] of SLIDES) {
        expect(wrappers).toContain(name);
      }
    } finally {
      await switchToTop();
    }
  });

  it("two-cols layout has both left + right column DOM nodes", async () => {
    await switchToSlideFrame();
    try {
      const counts = await browser.execute(() => ({
        left: document.querySelectorAll(".slides-ng-col-left").length,
        right: document.querySelectorAll(".slides-ng-col-right").length,
      }));
      // 13-layouts.md has two slides with `two-cols-style` columns:
      // two-cols and two-cols-header.
      expect(counts.left).toBeGreaterThanOrEqual(2);
      expect(counts.right).toBeGreaterThanOrEqual(2);
    } finally {
      await switchToTop();
    }
  });

  it("two-cols-header has a separate header region", async () => {
    await switchToSlideFrame();
    try {
      const headers = await browser.execute(
        () => document.querySelectorAll(".slides-ng-header").length
      );
      expect(headers).toBeGreaterThanOrEqual(1);
    } finally {
      await switchToTop();
    }
  });

  it("captures one screenshot per layout (each rendered standalone)", async () => {
    // Reveal.slide() doesn't reliably advance the embedded iframe from
    // browser.execute (same limitation we hit in M4/M5). Each layout is
    // rendered as its own one-slide deck instead so the iframe is fresh
    // for every screenshot.
    const decks: Record<string, string> = {
      cover: "---\ntheme: simple\nlayout: cover\n---\n\n# Slides NG\n\nA Slidev-style cover slide.\n",
      center: "---\ntheme: simple\nlayout: center\n---\n\n## Center layout\n\nCentered.\n",
      "two-cols":
        "---\ntheme: simple\nlayout: two-cols\n---\n\n# Two columns\n\n::left::\n\n### Left\n\n- alpha\n- bravo\n\n::right::\n\n### Right\n\n```ts\nconst x = 1\n```\n",
      "two-cols-header":
        "---\ntheme: simple\nlayout: two-cols-header\n---\n\n# Two columns + header\n\n::left::\n\nLeft body.\n\n::right::\n\nRight body.\n",
      quote: "---\ntheme: simple\nlayout: quote\n---\n\n> Simplicity is the ultimate sophistication.\n>\n> — Leonardo da Vinci\n",
      statement:
        "---\ntheme: simple\nlayout: statement\n---\n\nGood slides get out of the way of the idea.\n",
      section: "---\ntheme: simple\nlayout: section\n---\n\n# Part II\n\nThe next section begins here.\n",
      end: "---\ntheme: simple\nlayout: end\n---\n\n# Fin.\n\nThanks for reading.\n",
    };

    const iframe = await $(SLIDE_IFRAME_SELECTOR);

    for (const [name, content] of Object.entries(decks)) {
      const path = `Decks/__layout_${name}__.md`;
      await browser.executeObsidian(
        async ({ app }, { p, body }: { p: string; body: string }) => {
          const existing = app.vault.getAbstractFileByPath(p);
          if (existing) {
            // @ts-expect-error — TFile at runtime
            await app.vault.delete(existing);
          }
          // @ts-expect-error — TFile at runtime
          await app.vault.create(p, body);
          const file = app.vault.getAbstractFileByPath(p);
          // @ts-expect-error — TFile at runtime
          await app.workspace.getLeaf(false).openFile(file);
        },
        { p: path, body: content }
      );
      await browser.executeObsidian(({ app }) => {
        // @ts-expect-error — internal API
        app.commands.executeCommandById("slides-ng:open-preview");
      });
      await browser.pause(600);
      await iframe.saveScreenshot(`${SCREENSHOT_DIR}/${name}.png`);
    }

    // Tidy: remove the temp fixtures so they don't accumulate.
    await browser.executeObsidian(async ({ app }, names: string[]) => {
      for (const n of names) {
        const f = app.vault.getAbstractFileByPath(`Decks/__layout_${n}__.md`);
        if (f) {
          // @ts-expect-error — TFile at runtime
          await app.vault.delete(f);
        }
      }
    }, Object.keys(decks));
  });
});
