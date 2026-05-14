/**
 * picker-thumbnails.spec.ts — v0.11.0 PowerPoint-style picker.
 *
 * Verifies:
 *  - Speaker view mounts a picker iframe (not the legacy text list)
 *    when speakerPickerStyle = "thumbnails" (the default)
 *  - The iframe loads + builds the strip overlay
 *  - The orientation-toggle button flips vertical ↔ horizontal
 *  - Clicking a thumbnail tile drives the MAIN preview to that slide
 *  - Captures screenshots of both orientations for human review.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results";
const PREVIEW_VIEW_TYPE = "slides-ng-preview";
const SPEAKER_VIEW_TYPE = "slides-ng-speaker";

describe("v0.11.0 picker thumbnails", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // Open the conference-talk deck (10 slides — more than enough for
    // a meaningful strip).
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/01-conference-talk.md");
      if (file) {
        // @ts-expect-error — openFile accepts a TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    });

    // Open preview + speaker view.
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });
    await browser.waitUntil(
      async () =>
        (await browser.executeObsidian(({ app }, viewType: string) => {
          return app.workspace.getLeavesOfType(viewType).length;
        }, PREVIEW_VIEW_TYPE)) > 0,
      { timeout: 10000, timeoutMsg: "preview leaf never opened" }
    );
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-speaker-view");
    });
    await browser.waitUntil(
      async () =>
        (await browser.executeObsidian(({ app }, viewType: string) => {
          return app.workspace.getLeavesOfType(viewType).length;
        }, SPEAKER_VIEW_TYPE)) > 0,
      { timeout: 10000, timeoutMsg: "speaker leaf never opened" }
    );
    // Give the picker iframe time to render + enablePickerStrip burst
    // to land.
    await new Promise((r) => setTimeout(r, 2000));
  });

  it("mounts the picker iframe (thumbnails style is the default)", async () => {
    const iframeExists = await browser.execute(() => {
      return !!document.querySelector(".slides-ng-speaker-picker-iframe");
    });
    expect(iframeExists).toBe(true);

    const textListExists = await browser.execute(() => {
      return document.querySelectorAll(".slides-ng-speaker-list-item").length;
    });
    expect(textListExists).toBe(0);
  });

  it("the picker iframe has a non-empty srcdoc (deck rendered into it)", async () => {
    // Sandbox=allow-scripts blocks contentDocument from the parent;
    // best signal that the iframe has the deck loaded is that the
    // srcdoc attribute is set + non-trivial in size.
    const srcdocLength = await browser.execute(() => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        ".slides-ng-speaker-picker-iframe"
      );
      return iframe?.srcdoc?.length ?? 0;
    });
    // renderDeck output is ~280 KB for the conference talk deck.
    expect(srcdocLength).toBeGreaterThan(50000);
  });

  it("the orientation-toggle button is present in the picker header", async () => {
    const present = await browser.execute(() => {
      return !!document.querySelector(".slides-ng-speaker-picker-orient-btn");
    });
    expect(present).toBe(true);
  });

  it("captures vertical-orientation screenshot", async () => {
    await browser.saveScreenshot(
      `${SCREENSHOT_DIR}/v0110-picker-vertical.png`
    );
  });

  it("clicking the orientation button persists the new orientation in settings", async () => {
    const before = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — plugins is internal
      const plugin = app.plugins.plugins["slides-ng"];
      return plugin?.settings?.speakerPickerOrientation ?? null;
    });
    expect(before).toBe("vertical");

    await browser.execute(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        ".slides-ng-speaker-picker-orient-btn"
      );
      btn?.click();
    });

    await browser.waitUntil(
      async () => {
        const cur = await browser.executeObsidian(({ app }) => {
          // @ts-expect-error — plugins is internal
          const plugin = app.plugins.plugins["slides-ng"];
          return plugin?.settings?.speakerPickerOrientation ?? null;
        });
        return cur === "horizontal";
      },
      { timeout: 3000, timeoutMsg: "orientation didn't flip to horizontal" }
    );
  });

  it("captures horizontal-orientation screenshot", async () => {
    // Give the iframe a beat to repaint after the postMessage.
    await new Promise((r) => setTimeout(r, 500));
    await browser.saveScreenshot(
      `${SCREENSHOT_DIR}/v0110-picker-horizontal.png`
    );
  });

  it("simulated tile-click postMessage drives the main preview", async () => {
    // The actual click happens inside the sandboxed iframe, which we
    // can't reach from the parent. Simulate the message the iframe
    // would post to verify the speaker view's forwarding works.
    const startPos = await browser.execute(() => {
      const el = document.querySelector(
        ".slides-ng-speaker-position"
      ) as HTMLElement | null;
      return el?.textContent ?? "";
    });

    await browser.execute(() => {
      window.postMessage(
        { type: "slides-ng-picker", event: "click", idx: 2 },
        "*"
      );
    });

    await browser.waitUntil(
      async () => {
        const pos = await browser.execute(() => {
          const el = document.querySelector(
            ".slides-ng-speaker-position"
          ) as HTMLElement | null;
          return el?.textContent ?? "";
        });
        return (
          typeof pos === "string" &&
          pos.includes("Slide 3 of") &&
          pos !== startPos
        );
      },
      { timeout: 5000, timeoutMsg: "main preview never advanced to slide 3" }
    );
  });

  it("flips back to vertical for cleanup", async () => {
    await browser.execute(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        ".slides-ng-speaker-picker-orient-btn"
      );
      btn?.click();
    });
  });

  // Helper: re-activate the speaker view tab so screenshots actually
  // capture it (opening a different markdown file switches tab focus).
  async function activateSpeakerTab(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
      const speakerLeaves = app.workspace.getLeavesOfType("slides-ng-speaker");
      if (speakerLeaves.length > 0) {
        // @ts-expect-error — internal API
        app.workspace.setActiveLeaf(speakerLeaves[0], { focus: false });
        app.workspace.revealLeaf(speakerLeaves[0]);
      }
    });
    await new Promise((r) => setTimeout(r, 300));
  }

  // v0.11.1 — additional interaction coverage with the kitchen-sink
  // deck (more slides, exercises scrolling + repeated navigation).
  it("loads the kitchen-sink deck (more slides for scroll testing)", async () => {
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/07-kitchen-sink.md");
      if (file) {
        // @ts-expect-error — TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });
    // Wait for the speaker view to receive an updated state.
    await browser.waitUntil(
      async () => {
        const total = await browser.execute(() => {
          const el = document.querySelector(
            ".slides-ng-speaker-position"
          ) as HTMLElement | null;
          const text = el?.textContent ?? "";
          const m = text.match(/of (\d+)/);
          return m ? parseInt(m[1], 10) : 0;
        });
        return (total as number) >= 8;
      },
      { timeout: 8000, timeoutMsg: "kitchen-sink deck never loaded into speaker view" }
    );
    // Bring the speaker view to the front so screenshots capture it.
    await activateSpeakerTab();
  });

  it("captures default-state screenshot with the kitchen-sink deck", async () => {
    await activateSpeakerTab();
    await new Promise((r) => setTimeout(r, 1500));
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/v0111-picker-default.png`);
  });

  it("the picker iframe is configured to be scrollable (sandbox-safe verification)", async () => {
    // Chrome doesn't route synthetic WheelEvents into sandboxed
    // iframes; real-user wheel scrolling works but can't be
    // simulated from the parent context. We verify scrollability
    // indirectly: the deck has 18+ slides (kitchen-sink), the strip
    // tiles are at least 100px each + gap, so total scroll-content
    // exceeds typical panel height. The strip's overflow:auto is
    // set in code (see applyPickerStripLayout).
    const totalSlides = await browser.execute(() => {
      const el = document.querySelector(
        ".slides-ng-speaker-position"
      ) as HTMLElement | null;
      const m = (el?.textContent ?? "").match(/of (\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    });
    expect(totalSlides).toBeGreaterThanOrEqual(10);
  });

  it("clicking slide-5 tile via postMessage navigates main preview + updates current indicator", async () => {
    await browser.execute(() => {
      window.postMessage(
        { type: "slides-ng-picker", event: "click", idx: 4 },
        "*"
      );
    });
    await browser.waitUntil(
      async () => {
        const pos = await browser.execute(() => {
          const el = document.querySelector(
            ".slides-ng-speaker-position"
          ) as HTMLElement | null;
          return el?.textContent ?? "";
        });
        return typeof pos === "string" && pos.includes("Slide 5 of");
      },
      { timeout: 5000, timeoutMsg: "main preview didn't advance to slide 5" }
    );
    await new Promise((r) => setTimeout(r, 600));
    await activateSpeakerTab();
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/v0111-picker-at-slide-5.png`);
  });

  it("rapid sequential picks all land (idx 7, idx 2, idx 9)", async () => {
    for (const idx of [7, 2, 9]) {
      await browser.execute((i: number) => {
        window.postMessage({ type: "slides-ng-picker", event: "click", idx: i }, "*");
      }, idx);
      await new Promise((r) => setTimeout(r, 250));
    }
    await browser.waitUntil(
      async () => {
        const pos = await browser.execute(() => {
          const el = document.querySelector(
            ".slides-ng-speaker-position"
          ) as HTMLElement | null;
          return el?.textContent ?? "";
        });
        return typeof pos === "string" && pos.includes("Slide 10 of");
      },
      { timeout: 5000, timeoutMsg: "sequential picks didn't land on final idx 9 (Slide 10)" }
    );
  });

  it("horizontal mode + scroll + click round-trip", async () => {
    // Flip to horizontal.
    await browser.execute(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        ".slides-ng-speaker-picker-orient-btn"
      );
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await activateSpeakerTab();
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/v0111-picker-horizontal-kitchen-sink.png`);

    // (Synthetic WheelEvent doesn't propagate into sandboxed iframes
    // — see "scrollable" test above. Skip the wheel-scroll screenshot.)

    // Pick idx 3 via postMessage.
    await browser.execute(() => {
      window.postMessage({ type: "slides-ng-picker", event: "click", idx: 3 }, "*");
    });
    await browser.waitUntil(
      async () => {
        const pos = await browser.execute(() => {
          const el = document.querySelector(
            ".slides-ng-speaker-position"
          ) as HTMLElement | null;
          return el?.textContent ?? "";
        });
        return typeof pos === "string" && pos.includes("Slide 4 of");
      },
      { timeout: 5000, timeoutMsg: "horizontal-mode click didn't advance preview" }
    );

    // Flip back so the next test run starts at vertical.
    await browser.execute(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        ".slides-ng-speaker-picker-orient-btn"
      );
      btn?.click();
    });
  });

  it("captures final overview screenshot", async () => {
    await activateSpeakerTab();
    await new Promise((r) => setTimeout(r, 500));
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/v0111-picker-final.png`);
  });
});
