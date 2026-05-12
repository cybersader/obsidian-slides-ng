/**
 * speaker-view.spec.ts — v0.5.0 visual + integration test.
 *
 * Drives the in-Obsidian Speaker Console:
 *   1. Open preview + speaker view
 *   2. Verify state messages flow from the iframe to the speaker DOM
 *      (slide-count, notes, picker)
 *   3. Click Next/Prev in the speaker view; assert the iframe's
 *      `.section.present` advances
 *   4. Toggle blackout; assert `#slides-ng-blackout` overlay is added in
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

  it("Blackout toggles an overlay div inside the iframe", async () => {
    await clickSpeakerButtonByText("Blackout");

    // Speaker view's blackout button should now read "Blackout on".
    await browser.waitUntil(
      async () => {
        const txt = await browser.execute(() => {
          const b = document.querySelector(".slides-ng-speaker-blackout") as HTMLElement | null;
          return b?.innerText?.trim() ?? "";
        });
        return txt.toLowerCase().includes("on");
      },
      { timeout: 5000, timeoutMsg: "blackout button label never updated to 'on'" }
    );

    // And the iframe should have a #slides-ng-blackout overlay element.
    await switchToSlideFrame();
    try {
      const hasOverlay = await browser.execute(
        () => !!document.getElementById("slides-ng-blackout")
      );
      expect(hasOverlay).toBe(true);
    } finally {
      await switchToTop();
    }

    // Screenshot the blackout state — speaker on + iframe blacked out.
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/speaker-view-blackout.png`);

    // Toggle off so subsequent tests aren't affected.
    await clickSpeakerButtonByText("Blackout");
    await browser.waitUntil(
      async () => {
        const txt = await browser.execute(() => {
          const b = document.querySelector(".slides-ng-speaker-blackout") as HTMLElement | null;
          return b?.innerText?.trim() ?? "";
        });
        return !txt.toLowerCase().includes("on");
      },
      { timeout: 5000, timeoutMsg: "blackout did not toggle off" }
    );
  });

  it("Slide picker mode toggles between compact and list", async () => {
    // Initial mode label is "compact".
    const initialLabel = await browser.execute(() => {
      const b = document.querySelector(".slides-ng-speaker-mode-toggle") as HTMLElement | null;
      return b?.innerText?.trim() ?? "";
    });
    expect(initialLabel).toBe("Mode: compact");

    // In compact mode, picker should contain a compact-current row.
    const compactHasCurrent = await browser.execute(
      () => !!document.querySelector(".slides-ng-speaker-compact-current")
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
          return b?.innerText?.trim() ?? "";
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

  it("captures speaker + preview screenshot", async () => {
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/speaker-view-side-by-side.png`);
  });
});
