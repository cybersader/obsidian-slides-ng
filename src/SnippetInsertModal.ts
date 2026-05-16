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
import { smartWrap } from "./smartWrap";

export class SnippetInsertModal extends FuzzySuggestModal<SnippetTemplate> {
  private editor: Editor;
  private smartWrapEnabled: boolean;

  constructor(app: App, editor: Editor, smartWrapEnabled = false) {
    super(app);
    this.editor = editor;
    this.smartWrapEnabled = smartWrapEnabled;
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
      // Wrap mode. v0.12.2: if experimentalSmartWrap is on, try
      // header-structure distribution first (H2 sections → child
      // slots). Falls back to basic wrap if structure doesn\'t match.
      const result = this.smartWrapEnabled
        ? smartWrap(text, cursorOffset, selection)
        : {
            text: text.slice(0, cursorOffset) + selection + text.slice(cursorOffset),
            cursorOffset: cursorOffset + selection.length,
            applied: false,
          };
      this.editor.replaceSelection(result.text);
      const from = this.editor.getCursor("from");
      const insertedEnd = locateCursor(from.line, result.text, result.cursorOffset);
      this.editor.setCursor(insertedEnd);
      if (this.smartWrapEnabled && result.applied) {
        new Notice("Smart-wrap: distributed selection by header structure.");
      }
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
export function openSnippetInsertModal(app: App, smartWrapEnabled = false): void {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || !view.editor) {
    new Notice(
      "Open a Markdown deck and place the caret in the editor before inserting a snippet."
    );
    return;
  }
  new SnippetInsertModal(app, view.editor, smartWrapEnabled).open();
}
