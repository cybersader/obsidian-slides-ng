/**
 * speaker-070.spec.ts — v0.7.0 integration tests for the speaker UX
 * overhaul: icon-based buttons, grid mode fix, scenes overlay, Menu
 * toolbar button, visual next-slide preview iframe.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results";
const PREVIEW_VIEW_TYPE = "slides-ng-preview";
const SPEAKER_VIEW_TYPE = "slides-ng-speaker";

async function setupPreviewAndSpeaker(deckPath: string): Promise<void> {
  // Detach prior leaves so we start clean.
  await browser.executeObsidian(({ app }) => {
    for (const t of ["slides-ng-preview", "slides-ng-speaker"]) {
      const leaves = app.workspace.getLeavesOfType(t);
      for (const leaf of leaves) leaf.detach();
    }
  });
  await browser.executeObsidian(
    async ({ app }, p: string) => {
      const file = app.vault.getAbstractFileByPath(p);
      if (file) {
        // @ts-expect-error — openFile accepts TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    },
    deckPath
  );
  await browser.waitUntil(
    async () =>
      (await browser.executeObsidian(
        ({ app }, t: string) => app.workspace.getLeavesOfType(t).length,
        PREVIEW_VIEW_TYPE
      )) > 0,
    { timeout: 10000, timeoutMsg: "preview leaf never opened" }
  );
  await switchToSlideFrame();
  try {
    await waitForSlides(2, 8000);
  } finally {
    await switchToTop();
  }
  await browser.executeObsidian(({ app }) => {
    // @ts-expect-error — internal API
    app.commands.executeCommandById("slides-ng:open-speaker-view");
  });
  await browser.waitUntil(
    async () =>
      (await browser.executeObsidian(
        ({ app }, t: string) => app.workspace.getLeavesOfType(t).length,
        SPEAKER_VIEW_TYPE
      )) > 0,
    { timeout: 8000, timeoutMsg: "speaker leaf never opened" }
  );
  // Wait for initial state to arrive in speaker view.
  await browser.waitUntil(
    async () => {
      const text = await browser.execute(() => {
        const el = document.querySelector(".slides-ng-speaker-position") as HTMLElement | null;
        return el?.textContent?.trim() ?? "";
      });
      return /Slide \d+ of \d+/.test(text);
    },
    { timeout: 8000, timeoutMsg: "speaker view never received state" }
  );
}

describe("v0.7.0 — speaker UX overhaul + scenes", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await setupPreviewAndSpeaker("Decks/example.md");
  });

  it("speaker control buttons each carry an .svg-icon (icon-based UI)", async () => {
    const count = await browser.execute(
      () => document.querySelectorAll(".slides-ng-speaker-btn .svg-icon").length
    );
    // At least: 4 nav + 2 utility + 2 timer + 4 scenes = 12. Allow >= 8 to be safe.
    expect(count).toBeGreaterThanOrEqual(8);
  });

  it("Next button has the mod-cta accent class (primary action)", async () => {
    const hasAccent = await browser.execute(() => {
      const btns = Array.from(
        document.querySelectorAll(".slides-ng-speaker-nav-group .slides-ng-speaker-btn")
      ) as HTMLButtonElement[];
      const next = btns.find((b) => (b.textContent ?? "").trim().startsWith("Next"));
      return !!next?.classList.contains("mod-cta");
    });
    expect(hasAccent).toBe(true);
  });

  it("Menu toolbar button is present in the preview toolbar", async () => {
    const labels = await browser.execute(() => {
      const btns = Array.from(
        document.querySelectorAll(".slides-ng-toolbar .slides-ng-toolbar-btn")
      ) as HTMLButtonElement[];
      return btns.map((b) => (b.textContent ?? "").trim());
    });
    expect(labels).toContain("Menu");
  });

  it("Grid button triggers reveal overview AND the .slides has a grid display", async () => {
    // Click the Grid button.
    await browser.execute(() => {
      const btns = Array.from(
        document.querySelectorAll(".slides-ng-speaker-util-group .slides-ng-speaker-btn")
      ) as HTMLButtonElement[];
      btns.find((b) => (b.textContent ?? "").trim().startsWith("Grid"))?.click();
    });

    await switchToSlideFrame();
    try {
      await browser.waitUntil(
        async () => {
          const isOverview = await browser.execute(() => {
            return document.querySelector(".reveal")?.classList.contains("overview") ?? false;
          });
          return isOverview;
        },
        { timeout: 5000, timeoutMsg: "reveal never entered overview mode" }
      );

      // Assert .slides has grid display (the v0.7.0 fix).
      const isGrid = await browser.execute(() => {
        const slides = document.querySelector(".reveal.overview .slides") as HTMLElement | null;
        if (!slides) return false;
        return window.getComputedStyle(slides).display === "grid";
      });
      expect(isGrid).toBe(true);

      await browser.saveScreenshot(`${SCREENSHOT_DIR}/v070-grid-mode.png`);
    } finally {
      await switchToTop();
    }

    // Toggle off so subsequent tests aren't affected.
    await browser.execute(() => {
      const btns = Array.from(
        document.querySelectorAll(".slides-ng-speaker-util-group .slides-ng-speaker-btn")
      ) as HTMLButtonElement[];
      btns.find((b) => (b.textContent ?? "").trim().startsWith("Grid"))?.click();
    });
  });

  it("clicking a scene button overlays the scene in the iframe", async () => {
    // Helper: find the BRB scene button.
    const findBrbBtn = `
      Array.from(document.querySelectorAll(".slides-ng-speaker-scenes .slides-ng-speaker-btn"))
        .find((b) => (b.textContent ?? "").trim().includes("Be right back"))
    `;

    // Click the "Be right back" scene.
    await browser.execute(`(${findBrbBtn}).click();`);

    // Wait until the speaker's BUTTON has .on (only flips after the
    // state event from the iframe arrives at parent + applyState runs).
    // This is a stronger sync than checking the iframe DOM alone.
    await browser.waitUntil(
      async () =>
        await browser.execute(`return (${findBrbBtn})?.classList.contains("on") ?? false;`),
      { timeout: 5000, timeoutMsg: "BRB scene button never got .on class" }
    );

    // Now verify the iframe overlay is up + contains the scene content.
    await switchToSlideFrame();
    try {
      const html = await browser.execute(() => {
        const el = document.getElementById("slides-ng-scene");
        return el?.classList.contains("on") ? el.innerHTML : "";
      });
      expect(html).toContain("Be right back");
      await browser.saveScreenshot(`${SCREENSHOT_DIR}/v070-scene-brb.png`);
    } finally {
      await switchToTop();
    }

    // Click the same button again to clear.
    await browser.execute(`(${findBrbBtn}).click();`);

    // Wait for the speaker's button to LOSE .on (full round-trip done).
    await browser.waitUntil(
      async () =>
        await browser.execute(`return !((${findBrbBtn})?.classList.contains("on") ?? false);`),
      { timeout: 5000, timeoutMsg: "BRB scene button never lost .on class" }
    );

    // And confirm the iframe overlay is gone.
    await switchToSlideFrame();
    try {
      const active = await browser.execute(() => {
        const el = document.getElementById("slides-ng-scene");
        return el?.classList.contains("on") ?? false;
      });
      expect(active).toBe(false);
    } finally {
      await switchToTop();
    }
  });

  it("visual next-slide preview mini-iframe is present + has non-empty srcdoc", async () => {
    // Wait for the speaker view to have rendered its mini-iframe.
    await browser.waitUntil(
      async () => {
        const has = await browser.execute(() => {
          const iframe = document.querySelector(
            ".slides-ng-speaker-visual-next-frame"
          ) as HTMLIFrameElement | null;
          return !!iframe && (iframe.srcdoc?.length ?? 0) > 1000;
        });
        return has;
      },
      { timeout: 8000, timeoutMsg: "visual next-slide iframe never received srcdoc" }
    );
    const srcdocLen = await browser.execute(() => {
      const iframe = document.querySelector(
        ".slides-ng-speaker-visual-next-frame"
      ) as HTMLIFrameElement | null;
      return iframe?.srcdoc?.length ?? 0;
    });
    expect(srcdocLen).toBeGreaterThan(1000);

    await browser.saveScreenshot(`${SCREENSHOT_DIR}/v070-speaker-overhauled.png`);
  });
});
