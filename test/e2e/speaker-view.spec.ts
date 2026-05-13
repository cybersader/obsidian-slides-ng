/**
 * speaker-view.spec.ts — v0.5.0 visual + integration test.
 *
 * Drives the in-Obsidian Speaker Console:
 *   1. Open preview + speaker view
 *   2. Verify state messages flow from the iframe to the speaker DOM
 *      (slide-count, notes, picker)
 *   3. Click Next/Prev in the speaker view; assert the iframe's
 *      `.section.present` advances
 *   4. Toggle blackout; assert `#slides-ng-scene` overlay is added in
 *      the iframe
 *   5. Toggle picker mode (compact ↔ list); assert UI updates
 *   6. Screenshots: speaker + preview side-by-side, blackout state.
 *
 * The speaker view talks to the iframe via postMessage; nothing this spec
 * does pokes at the bridge internals — it observes user-visible DOM only.
 */

import { browser, $ } from "@wdio/globals";
import { expect } from "expect";
import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results";
const SPEAKER_VIEW_TYPE = "slides-ng-speaker";
const PREVIEW_VIEW_TYPE = "slides-ng-preview";

async function clickSpeakerButtonByText(label: string): Promise<void> {
  // Speaker view buttons aren't uniquely identifiable by CSS alone (mostly
  // share `.slides-ng-speaker-btn`), so we find the one whose text content
  // starts with the given label. browser.execute runs in the Obsidian DOM,
  // not the iframe — which is correct: the speaker view lives outside it.
  const clicked = await browser.execute((text: string) => {
    const btn = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".slides-ng-speaker button.slides-ng-speaker-btn")
    ).find((b) => (b.textContent ?? "").trim().startsWith(text));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, label);
  if (!clicked) {
    throw new Error(`Speaker view button starting with "${label}" not found.`);
  }
}

async function readSpeakerPosition(): Promise<string> {
  return await browser.execute(() => {
    const el = document.querySelector(".slides-ng-speaker-position") as HTMLElement | null;
    return el?.innerText?.trim() ?? "";
  });
}

describe("slides-ng speaker view drives the preview", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // Open the seed deck.
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/example.md");
      if (file) {
        // @ts-expect-error — openFile accepts a TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    });

    // Open preview.
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — executeCommandById is internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });
    await browser.waitUntil(
      async () =>
        (await browser.executeObsidian(
          ({ app }, t: string) => app.workspace.getLeavesOfType(t).length,
          PREVIEW_VIEW_TYPE
        )) > 0,
      { timeout: 10000, timeoutMsg: "slides-ng preview leaf never opened" }
    );

    // Wait for reveal.js to mount inside the iframe.
    await switchToSlideFrame();
    try {
      await waitForSlides(2, 8000);
    } finally {
      await switchToTop();
    }

    // Now open speaker view.
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
      { timeout: 8000, timeoutMsg: "speaker view leaf never opened" }
    );
  });

  it("speaker view receives state from the iframe and displays slide count", async () => {
    await browser.waitUntil(
      async () => {
        const text = await readSpeakerPosition();
        return /Slide \d+ of \d+/.test(text);
      },
      {
        timeout: 8000,
        timeoutMsg: "speaker view never received initial state from the iframe",
      }
    );
    const position = await readSpeakerPosition();
    expect(position).toMatch(/Slide 1 of \d+/);
  });

  it("Last button jumps the preview to the final slide", async () => {
    // NOTE: deliberately using Last (Reveal.slide(N-1)) rather than Next
    // because the example deck's first slide has <v-clicks> fragments —
    // Reveal.next() reveals a fragment instead of advancing the slide
    // index. Reveal.slide(idx) bypasses fragments entirely, so the
    // speaker → iframe drive path stays testable.
    const before = await readSpeakerPosition();

    await clickSpeakerButtonByText("Last");

    await browser.waitUntil(
      async () => {
        const now = await readSpeakerPosition();
        return now !== before && /Slide \d+ of \d+/.test(now);
      },
      {
        timeout: 5000,
        timeoutMsg: `Speaker view position never updated after clicking Last (was "${before}")`,
      }
    );

    const after = await readSpeakerPosition();
    // Expect "Slide N of N" where N is the total. The example deck has 7.
    expect(after).toMatch(/Slide (\d+) of \1/);
  });

  it("First button returns the preview to the opening slide", async () => {
    const before = await readSpeakerPosition();
    await clickSpeakerButtonByText("First");
    await browser.waitUntil(
      async () => (await readSpeakerPosition()) !== before,
      { timeout: 5000, timeoutMsg: "speaker view never updated after First" }
    );
    const after = await readSpeakerPosition();
    expect(after).toMatch(/Slide 1 of \d+/);
  });

  it("Blackout scene toggles an overlay div inside the iframe", async () => {
    // In v0.7.1+ Blackout is accessed via the Scenes row (the duplicate
    // util-group button was removed). We click the Blackout SCENE
    // button in the scenes row.
    const clickBlackoutScene = `
      Array.from(document.querySelectorAll(".slides-ng-speaker-scenes .slides-ng-speaker-btn"))
        .find((b) => (b.textContent ?? "").trim().includes("Blackout"))
        ?.click();
    `;
    await browser.execute(clickBlackoutScene);

    // Wait until the scene's button has .on class (state event round-trip).
    await browser.waitUntil(
      async () =>
        await browser.execute(() => {
          const btn = Array.from(
            document.querySelectorAll(".slides-ng-speaker-scenes .slides-ng-speaker-btn")
          ).find((b) => (b.textContent ?? "").trim().includes("Blackout"));
          return btn?.classList.contains("on") ?? false;
        }),
      { timeout: 5000, timeoutMsg: "Blackout scene never marked active" }
    );

    // And the iframe should have a #slides-ng-scene overlay element
    // with the .on class.
    await switchToSlideFrame();
    try {
      const hasOverlay = await browser.execute(() => {
        const el = document.getElementById("slides-ng-scene");
        return !!el && el.classList.contains("on");
      });
      expect(hasOverlay).toBe(true);
    } finally {
      await switchToTop();
    }

    // Screenshot the blackout state.
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/speaker-view-blackout.png`);

    // Toggle off so subsequent tests aren't affected.
    await browser.execute(clickBlackoutScene);
    await browser.waitUntil(
      async () =>
        await browser.execute(() => {
          const btn = Array.from(
            document.querySelectorAll(".slides-ng-speaker-scenes .slides-ng-speaker-btn")
          ).find((b) => (b.textContent ?? "").trim().includes("Blackout"));
          return !(btn?.classList.contains("on") ?? false);
        }),
      { timeout: 5000, timeoutMsg: "blackout did not toggle off" }
    );
  });

  it("Slide picker mode toggles between compact and list", async () => {
    // Initial mode label is "compact".
    const initialLabel = await browser.execute(() => {
      const b = document.querySelector(".slides-ng-speaker-mode-toggle") as HTMLElement | null;
      return b?.textContent?.trim() ?? "";
    });
    expect(initialLabel).toBe("Mode: compact");

    // In compact mode, picker should contain a row marked "current"
    // (v0.8.0+ redesign — was .slides-ng-speaker-compact-current).
    const compactHasCurrent = await browser.execute(
      () => !!document.querySelector(".slides-ng-speaker-compact-row.current")
    );
    expect(compactHasCurrent).toBe(true);

    // Click the toggle. Wait for the label to flip, then assert the DOM
    // matches list mode.
    await browser.execute(() => {
      const b = document.querySelector(".slides-ng-speaker-mode-toggle") as HTMLButtonElement | null;
      b?.click();
    });

    await browser.waitUntil(
      async () => {
        const label = await browser.execute(() => {
          const b = document.querySelector(".slides-ng-speaker-mode-toggle") as HTMLElement | null;
          return b?.textContent?.trim() ?? "";
        });
        return label === "Mode: list";
      },
      { timeout: 5000, timeoutMsg: "mode-toggle label never flipped to 'Mode: list'" }
    );

    // After flip, list-item rows should exist (≥ totalSlides). Use a longer
    // wait window because a state-tick from the iframe can re-render the
    // picker after the click and the snapshot of children can briefly be
    // empty during the re-render.
    await browser.waitUntil(
      async () => {
        const items = await browser.execute(
          () => document.querySelectorAll(".slides-ng-speaker-list-item").length
        );
        return items >= 2;
      },
      { timeout: 5000, timeoutMsg: "list mode never rendered list-item rows" }
    );

    const listCount = await browser.execute(
      () => document.querySelectorAll(".slides-ng-speaker-list-item").length
    );
    expect(listCount).toBeGreaterThanOrEqual(2);
  });

  it("Start button label flips to 'Pause' and accent class added when running", async () => {
    // Find the timer toggle button (the one starting with "Start").
    const initial = await browser.execute(() => {
      const btns = Array.from(
        document.querySelectorAll(".slides-ng-speaker-timer-ctrls .slides-ng-speaker-btn")
      ) as HTMLButtonElement[];
      const btn = btns.find((b) => (b.textContent ?? "").trim() === "Start");
      return {
        found: !!btn,
        text: btn?.textContent?.trim() ?? "",
        hasMod: btn?.classList.contains("mod-cta") ?? false,
      };
    });
    expect(initial.found).toBe(true);
    expect(initial.text).toBe("Start");
    expect(initial.hasMod).toBe(false);

    // Click Start.
    await browser.execute(() => {
      const btns = Array.from(
        document.querySelectorAll(".slides-ng-speaker-timer-ctrls .slides-ng-speaker-btn")
      ) as HTMLButtonElement[];
      btns.find((b) => (b.textContent ?? "").trim() === "Start")?.click();
    });

    await browser.waitUntil(
      async () => {
        const txt = await browser.execute(() => {
          const btns = Array.from(
            document.querySelectorAll(".slides-ng-speaker-timer-ctrls .slides-ng-speaker-btn")
          ) as HTMLButtonElement[];
          // After click the label flips to "Pause" — find by that text.
          return btns.find((b) => (b.textContent ?? "").trim() === "Pause") ? "Pause" : "";
        });
        return txt === "Pause";
      },
      { timeout: 3000, timeoutMsg: "timer button never flipped to Pause" }
    );

    const running = await browser.execute(() => {
      const btns = Array.from(
        document.querySelectorAll(".slides-ng-speaker-timer-ctrls .slides-ng-speaker-btn")
      ) as HTMLButtonElement[];
      const btn = btns.find((b) => (b.textContent ?? "").trim() === "Pause");
      return {
        text: btn?.textContent?.trim() ?? "",
        hasMod: btn?.classList.contains("mod-cta") ?? false,
      };
    });
    expect(running.text).toBe("Pause");
    expect(running.hasMod).toBe(true);

    // Click Pause to stop the timer (don't leak running interval into
    // subsequent specs).
    await browser.execute(() => {
      const btns = Array.from(
        document.querySelectorAll(".slides-ng-speaker-timer-ctrls .slides-ng-speaker-btn")
      ) as HTMLButtonElement[];
      btns.find((b) => (b.textContent ?? "").trim() === "Pause")?.click();
    });
  });

  it("Grid button opens the custom slides-picker overlay", async () => {
    // v0.7.3+ — Grid uses a custom overlay (#slides-ng-grid) instead
    // of reveal's stock overview.
    await clickSpeakerButtonByText("Grid");
    await switchToSlideFrame();
    try {
      await browser.waitUntil(
        async () =>
          await browser.execute(() => !!document.getElementById("slides-ng-grid")),
        { timeout: 5000, timeoutMsg: "Grid overlay never opened" }
      );
    } finally {
      await switchToTop();
    }

    // Toggle off so subsequent tests aren't affected.
    await clickSpeakerButtonByText("Grid");
  });

  it("captures speaker + preview screenshot", async () => {
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/speaker-view-side-by-side.png`);
  });
});
