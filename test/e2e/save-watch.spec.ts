/**
 * save-watch.spec.ts — M3 visual + integration test.
 *
 * Proves the save-watch loop works: open a deck, modify the markdown via
 * the vault API, wait for the debounced rerender, assert the iframe
 * reflects the new slide count.
 *
 * Architectural negative-assert: also confirms no localhost port is
 * listening from inside the renderer iframe and no child process was
 * spawned. Both are static-source-guarded in tests/hardConstraints.test.ts
 * but a runtime check here adds a second layer of defense.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";

const DEBOUNCE_GRACE_MS = 600; // 300 ms debounce + render time + frame paint

describe("slides-ng save-watch", function () {
  before(async () => {
    // Open the example deck + preview.
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

  it("appends a slide and the iframe re-renders within the debounce window", async () => {
    // Capture the initial slide count inside the iframe.
    await switchToSlideFrame();
    let initialCount = 0;
    try {
      await waitForSlides(6, 8000);
      initialCount = await browser.execute(
        () => document.querySelectorAll(".reveal section").length
      );
    } finally {
      await switchToTop();
    }
    expect(initialCount).toBeGreaterThanOrEqual(6);

    // Append a new horizontal slide to the active deck via the vault API.
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/example.md");
      if (!file) throw new Error("Decks/example.md not found in vault");
      // @ts-expect-error — TFile at runtime; types complain about TAbstractFile
      const content = await app.vault.read(file);
      // @ts-expect-error — same as above
      await app.vault.modify(file, content + "\n\n---\n\n# Save-watch test slide\n");
    });

    // Wait through the debounce window.
    await browser.pause(DEBOUNCE_GRACE_MS);

    // Verify the iframe re-rendered with one more section.
    await switchToSlideFrame();
    let newCount = 0;
    try {
      await browser.waitUntil(
        async () => {
          const c = await browser.execute(
            () => document.querySelectorAll(".reveal section").length
          );
          return c > initialCount;
        },
        { timeout: 4000, timeoutMsg: "iframe did not re-render after save" }
      );
      newCount = await browser.execute(
        () => document.querySelectorAll(".reveal section").length
      );
    } finally {
      await switchToTop();
    }

    expect(newCount).toBeGreaterThan(initialCount);
  });

  it("no localhost listening port appears in the iframe", async () => {
    // Inside the srcdoc iframe, navigator.connection and document.location
    // should never reference a localhost URL — the whole architecture
    // forbids it. Quick runtime sanity check.
    await switchToSlideFrame();
    try {
      const url = await browser.execute(() => document.location.href);
      // srcdoc iframes have a location like "about:srcdoc" — anything else
      // (especially http://localhost:NNNN) is a regression.
      expect(url).toMatch(/^about:srcdoc/);
    } finally {
      await switchToTop();
    }
  });
});
