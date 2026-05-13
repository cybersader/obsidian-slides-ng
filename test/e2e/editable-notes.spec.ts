/**
 * editable-notes.spec.ts — v0.8.2 integration test for the speaker
 * view's "Edit notes" round-trip.
 *
 * Flow: open a deck → open speaker view → click Edit → type new notes
 * → click Save → assert the deck file was actually modified.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";

const PREVIEW = "slides-ng-preview";
const SPEAKER = "slides-ng-speaker";
const TEST_DECK = "Decks/__editable-notes__.md";
const INITIAL_DECK = [
  "---",
  "slides-ng-theme: black",
  "---",
  "",
  "# First slide",
  "",
  "Some content.",
  "",
  "<!-- initial note -->",
  "",
  "---",
  "",
  "# Second slide",
  "",
  "Body text.",
  "",
].join("\n");

async function detachAll(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    for (const t of ["slides-ng-speaker", "slides-ng-preview"]) {
      for (const leaf of app.workspace.getLeavesOfType(t)) leaf.detach();
    }
  });
}

describe("v0.8.2 — editable speaker notes", function () {
  before(async () => {
    await detachAll();
    await browser.executeObsidian(
      async ({ app }, payload: { path: string; body: string }) => {
        const { path, body } = payload;
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) {
          // @ts-expect-error delete accepts TFile at runtime
          await app.vault.delete(existing);
        }
        // @ts-expect-error create returns TFile at runtime
        await app.vault.create(path, body);
        const file = app.vault.getAbstractFileByPath(path);
        // @ts-expect-error openFile accepts TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
        // @ts-expect-error internal API
        app.commands.executeCommandById("slides-ng:open-preview");
      },
      { path: TEST_DECK, body: INITIAL_DECK }
    );
    await browser.waitUntil(
      async () =>
        (await browser.executeObsidian(
          ({ app }, t: string) => app.workspace.getLeavesOfType(t).length,
          PREVIEW
        )) > 0,
      { timeout: 10000 }
    );
    await switchToSlideFrame();
    try {
      await waitForSlides(2, 8000);
    } finally {
      await switchToTop();
    }
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error
      app.commands.executeCommandById("slides-ng:open-speaker-view");
    });
    await browser.waitUntil(
      async () =>
        (await browser.executeObsidian(
          ({ app }, t: string) => app.workspace.getLeavesOfType(t).length,
          SPEAKER
        )) > 0,
      { timeout: 8000 }
    );
    await browser.waitUntil(
      async () => {
        const t = await browser.execute(() => {
          const el = document.querySelector(".slides-ng-speaker-position") as HTMLElement | null;
          return el?.textContent?.trim() ?? "";
        });
        return /Slide \d+ of \d+/.test(t);
      },
      { timeout: 8000 }
    );
  });

  after(async () => {
    // Cleanup the test deck.
    await browser.executeObsidian(async ({ app }, path: string) => {
      const f = app.vault.getAbstractFileByPath(path);
      if (f) {
        // @ts-expect-error delete accepts TFile at runtime
        await app.vault.delete(f);
      }
    }, TEST_DECK);
  });

  it("clicking Edit swaps the notes panel into a textarea with the current notes", async () => {
    await browser.execute(() => {
      const btn = document.querySelector(
        ".slides-ng-speaker-notes-edit"
      ) as HTMLButtonElement | null;
      btn?.click();
    });

    await browser.waitUntil(
      async () =>
        await browser.execute(
          () => !!document.querySelector(".slides-ng-speaker-notes-textarea")
        ),
      { timeout: 3000, timeoutMsg: "edit textarea never appeared" }
    );

    const value = await browser.execute(() => {
      const ta = document.querySelector(
        ".slides-ng-speaker-notes-textarea"
      ) as HTMLTextAreaElement | null;
      return ta?.value ?? "";
    });
    expect(value).toBe("initial note");
  });

  it("clicking Save writes the new notes back to the deck file", async () => {
    const newNote = "EDITED-NOTE-FOR-TEST-" + Date.now();

    // Set the textarea value + click Save.
    await browser.execute(
      (note: string) => {
        const ta = document.querySelector(
          ".slides-ng-speaker-notes-textarea"
        ) as HTMLTextAreaElement | null;
        if (ta) ta.value = note;
        const buttons = Array.from(
          document.querySelectorAll(".slides-ng-speaker-notes-actions button")
        ) as HTMLButtonElement[];
        const save = buttons.find((b) => (b.textContent ?? "").trim() === "Save");
        save?.click();
      },
      newNote
    );

    // Wait for the edit mode to exit (textarea gone).
    await browser.waitUntil(
      async () =>
        await browser.execute(
          () => !document.querySelector(".slides-ng-speaker-notes-textarea")
        ),
      { timeout: 5000, timeoutMsg: "edit mode never exited after Save" }
    );

    // Read the deck file from disk and confirm the new note is in it.
    const fileBody = await browser.executeObsidian(
      async ({ app }, path: string) => {
        const f = app.vault.getAbstractFileByPath(path);
        if (!f) return "";
        // @ts-expect-error vault.read accepts TFile
        return await app.vault.read(f);
      },
      TEST_DECK
    );

    expect(fileBody).toContain(`<!-- ${newNote} -->`);
    expect(fileBody).not.toContain("<!-- initial note -->");
  });

  it("clicking Cancel discards the edit and restores the prior notes view", async () => {
    // Open editor again.
    await browser.execute(() => {
      const btn = document.querySelector(
        ".slides-ng-speaker-notes-edit"
      ) as HTMLButtonElement | null;
      btn?.click();
    });
    await browser.waitUntil(
      async () =>
        await browser.execute(
          () => !!document.querySelector(".slides-ng-speaker-notes-textarea")
        ),
      { timeout: 3000 }
    );

    // Type something then Cancel.
    await browser.execute(() => {
      const ta = document.querySelector(
        ".slides-ng-speaker-notes-textarea"
      ) as HTMLTextAreaElement | null;
      if (ta) ta.value = "SHOULD-NOT-PERSIST";
      const buttons = Array.from(
        document.querySelectorAll(".slides-ng-speaker-notes-actions button")
      ) as HTMLButtonElement[];
      const cancel = buttons.find((b) => (b.textContent ?? "").trim() === "Cancel");
      cancel?.click();
    });

    await browser.waitUntil(
      async () =>
        await browser.execute(
          () => !document.querySelector(".slides-ng-speaker-notes-textarea")
        ),
      { timeout: 3000 }
    );

    const fileBody = await browser.executeObsidian(
      async ({ app }, path: string) => {
        const f = app.vault.getAbstractFileByPath(path);
        if (!f) return "";
        // @ts-expect-error
        return await app.vault.read(f);
      },
      TEST_DECK
    );

    expect(fileBody).not.toContain("SHOULD-NOT-PERSIST");
  });
});
