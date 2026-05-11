/**
 * autocomplete.spec.ts — verifies the 3 EditorSuggest classes register and
 * fire correctly in real Obsidian.
 *
 * Approach: we don't drive raw keypresses (which is brittle in Electron-
 * over-WSL2). Instead we invoke the Obsidian Editor API directly to set
 * the buffer + cursor, then check whether the plugin's suggesters
 * activate the suggestion popup. The pure-function helpers
 * (parseAllFrontmatterBlocks, currentSlideLayout, isInFrontmatter) are
 * already covered by `tests/suggest.test.ts` — this spec adds the
 * integration-side proof that registration + onTrigger work end-to-end.
 */

import { browser, $ } from "@wdio/globals";
import { expect } from "expect";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results/autocomplete";

const TEST_FILE = "Decks/__autocomplete_test__.md";

describe("slides-ng autocomplete", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // Open a fresh markdown file for keypress experiments.
    await browser.executeObsidian(
      async ({ app }, path: string) => {
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) {
          // @ts-expect-error — TFile at runtime
          await app.vault.delete(existing);
        }
        // @ts-expect-error — TFile at runtime
        await app.vault.create(path, "---\n---\n\n# Hello\n");
        const file = app.vault.getAbstractFileByPath(path);
        // @ts-expect-error — TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      },
      TEST_FILE
    );
    await browser.pause(400);
  });

  after(async () => {
    await browser.executeObsidian(
      async ({ app }, path: string) => {
        const f = app.vault.getAbstractFileByPath(path);
        if (f) {
          // @ts-expect-error — TFile at runtime
          await app.vault.delete(f);
        }
      },
      TEST_FILE
    );
  });

  it("the plugin registered 3 editor suggesters", async () => {
    const count = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API: registeredEditorSuggests
      const suggesters = app.workspace.editorSuggest?.suggests ?? [];
      // Slides-ng adds 3; other plugins / Obsidian core may add more.
      const ours = suggesters.filter((s: { constructor: { name: string } }) =>
        ["LayoutNameSuggest", "SlotMarkerSuggest", "VClickSuggest"].includes(
          s.constructor.name
        )
      );
      return ours.length;
    });
    expect(count).toBe(3);
  });

  it("LayoutNameSuggest fires on `layout: ` inside frontmatter", async () => {
    const trigger = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      const editor = app.workspace.activeEditor?.editor;
      if (!editor) return null;
      editor.setValue("---\nlayout: \n---\n\n# Body\n");
      editor.setCursor({ line: 1, ch: 8 }); // right after "layout: "

      // @ts-expect-error — internal API: workspace.editorSuggest.suggests
      const suggests = app.workspace.editorSuggest?.suggests ?? [];
      const layoutSuggest = suggests.find(
        (s: { constructor: { name: string } }) =>
          s.constructor.name === "LayoutNameSuggest"
      );
      if (!layoutSuggest) return null;
      const info = layoutSuggest.onTrigger({ line: 1, ch: 8 }, editor, null);
      return info
        ? { start: info.start, end: info.end, query: info.query }
        : null;
    });
    expect(trigger).not.toBeNull();
    expect(trigger?.query).toBe("");
    expect(trigger?.start.line).toBe(1);
  });

  it("LayoutNameSuggest does NOT fire in the slide body", async () => {
    const trigger = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      const editor = app.workspace.activeEditor?.editor;
      if (!editor) return "no-editor";
      editor.setValue("---\n---\n\nlayout: not in fm\n");
      editor.setCursor({ line: 3, ch: 12 });
      // @ts-expect-error — internal API
      const suggests = app.workspace.editorSuggest?.suggests ?? [];
      const layoutSuggest = suggests.find(
        (s: { constructor: { name: string } }) =>
          s.constructor.name === "LayoutNameSuggest"
      );
      const info = layoutSuggest?.onTrigger({ line: 3, ch: 12 }, editor, null);
      return info ? "TRIGGERED" : "NULL";
    });
    expect(trigger).toBe("NULL");
  });

  it("SlotMarkerSuggest fires on `::` at start of line in slide body", async () => {
    const result = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      const editor = app.workspace.activeEditor?.editor;
      if (!editor) return null;
      editor.setValue(
        "---\nlayout: two-cols\n---\n\n# Slide\n\n::\n"
      );
      editor.setCursor({ line: 6, ch: 2 });
      // @ts-expect-error — internal API
      const suggests = app.workspace.editorSuggest?.suggests ?? [];
      const slotSuggest = suggests.find(
        (s: { constructor: { name: string } }) =>
          s.constructor.name === "SlotMarkerSuggest"
      );
      const info = slotSuggest?.onTrigger({ line: 6, ch: 2 }, editor, null);
      if (!info) return null;
      const ctx = { editor, ...info, file: null };
      const items = slotSuggest.getSuggestions(ctx);
      return {
        triggered: true,
        suggestionNames: items.map((s: { name: string }) => s.name),
      };
    });
    expect(result).not.toBeNull();
    expect(result?.triggered).toBe(true);
    // two-cols layout → expect left + right in suggestions
    expect(result?.suggestionNames).toEqual(
      expect.arrayContaining(["left", "right"])
    );
  });

  it("SlotMarkerSuggest does NOT fire inside frontmatter", async () => {
    const result = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      const editor = app.workspace.activeEditor?.editor;
      if (!editor) return "no-editor";
      editor.setValue("---\n::\n---\n");
      editor.setCursor({ line: 1, ch: 2 });
      // @ts-expect-error — internal API
      const suggests = app.workspace.editorSuggest?.suggests ?? [];
      const slotSuggest = suggests.find(
        (s: { constructor: { name: string } }) =>
          s.constructor.name === "SlotMarkerSuggest"
      );
      const info = slotSuggest?.onTrigger({ line: 1, ch: 2 }, editor, null);
      return info ? "TRIGGERED" : "NULL";
    });
    expect(result).toBe("NULL");
  });

  it("VClickSuggest fires on `<v-` in slide body", async () => {
    const result = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      const editor = app.workspace.activeEditor?.editor;
      if (!editor) return null;
      editor.setValue("---\n---\n\n# Slide\n\n<v-\n");
      editor.setCursor({ line: 5, ch: 3 });
      // @ts-expect-error — internal API
      const suggests = app.workspace.editorSuggest?.suggests ?? [];
      const vSuggest = suggests.find(
        (s: { constructor: { name: string } }) =>
          s.constructor.name === "VClickSuggest"
      );
      const info = vSuggest?.onTrigger({ line: 5, ch: 3 }, editor, null);
      if (!info) return null;
      const ctx = { editor, ...info, file: null };
      const items = vSuggest.getSuggestions(ctx);
      return { tags: items.map((s: { tag: string }) => s.tag) };
    });
    expect(result?.tags).toEqual(expect.arrayContaining(["v-click", "v-clicks"]));
  });

  it("captures a screenshot of the editor with autocomplete-relevant state", async () => {
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      const editor = app.workspace.activeEditor?.editor;
      if (editor) {
        editor.setValue(
          "---\nlayout: two-cols\n---\n\n# Two-cols demo\n\n::left::\n\nLeft content\n\n::right::\n\nRight content\n"
        );
      }
    });
    await browser.pause(300);
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/021-autocomplete-fixture.png`);
  });
});
