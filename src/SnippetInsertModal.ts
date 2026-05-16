/**
 * v0.12.1: command-palette flow for inserting HTML snippets.
 *
 * Opens a fuzzy suggester listing every snippet from `TEMPLATES`.
 * Behaviour depends on whether the editor has a selection at invoke
 * time:
 *
 *  - **No selection** → insert the snippet at the caret, replacing
 *    the cursor marker (`█`) with the caret position. Identical to
 *    the `::name` autocomplete flow.
 *
 *  - **Selection present** → "wrap" / "encase" mode. The selected
 *    text replaces the cursor marker in the snippet body, and the
 *    whole thing replaces the selection. Multi-slot snippets like
 *    `twocol` put the wrapped content in the FIRST slot (where the
 *    cursor marker lives); the user can shuffle from there.
 *
 * This is the second discovery path for snippets — the first being
 * the existing `::name` autocomplete. Both share the same registry.
 */

import { App, Editor, FuzzySuggestModal, MarkdownView, Notice } from "obsidian";
import { TEMPLATES, type SnippetTemplate, locateCursor } from "./templates";

export class SnippetInsertModal extends FuzzySuggestModal<SnippetTemplate> {
  private editor: Editor;

  constructor(app: App, editor: Editor) {
    super(app);
    this.editor = editor;
    this.setPlaceholder("Type to filter snippets (hero, twocol, callout, …)");
    this.setInstructions([
      { command: "↑↓", purpose: "navigate" },
      { command: "↵", purpose: "insert" },
      { command: "esc", purpose: "cancel" },
    ]);
  }

  getItems(): SnippetTemplate[] {
    return [...TEMPLATES];
  }

  getItemText(tpl: SnippetTemplate): string {
    return `${tpl.name}  —  ${tpl.description}`;
  }

  onChooseItem(tpl: SnippetTemplate): void {
    const { text, cursorOffset } = tpl.expand();
    const selection = this.editor.getSelection();

    if (selection && selection.length > 0) {
      // Wrap mode: drop selection where the cursor marker is, then
      // place the caret AT THE END of the wrapped content so the
      // user can keep typing immediately after.
      const wrapped =
        text.slice(0, cursorOffset) + selection + text.slice(cursorOffset);
      this.editor.replaceSelection(wrapped);
      // Position the cursor right after the inserted selection.
      const from = this.editor.getCursor("from");
      const insertedEnd = locateCursor(
        from.line,
        wrapped,
        cursorOffset + selection.length
      );
      this.editor.setCursor(insertedEnd);
    } else {
      // Insert mode: snippet body at caret with marker removed,
      // caret moved to where the marker was.
      const from = this.editor.getCursor();
      this.editor.replaceRange(text, from);
      const target = locateCursor(from.line, text, cursorOffset);
      this.editor.setCursor(target);
    }
  }
}

/**
 * Helper invoked by main.ts → addCommand. Resolves the active
 * Markdown editor and opens the modal, or shows a Notice if there's
 * nowhere to insert into.
 */
export function openSnippetInsertModal(app: App): void {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || !view.editor) {
    new Notice(
      "Open a Markdown deck and place the caret in the editor before inserting a snippet."
    );
    return;
  }
  new SnippetInsertModal(app, view.editor).open();
}
