/**
 * In-editor autocomplete for slides-ng authoring.
 *
 * Three independent `EditorSuggest` subclasses, each with a tight
 * `onTrigger` so they only fire when their context applies:
 *
 *   LayoutNameSuggest  — typing `layout: ` inside YAML frontmatter
 *                        → suggests names from LAYOUT_SCHEMAS
 *   SlotMarkerSuggest  — typing `::` at start of line in slide body
 *                        → suggests slot names for the current slide's
 *                          layout (context-aware; falls back to all
 *                          known slot names if no layout is set)
 *   VClickSuggest      — typing `<v-` anywhere in slide body
 *                        → suggests `<v-click>` and `<v-clicks>`
 *
 * Pattern source: obsidian-daily-notes-ng/src/nlp/DateSuggest.ts
 * (82-line working example).
 */

import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
  prepareFuzzySearch,
} from "obsidian";
import {
  LAYOUT_SCHEMAS,
  KNOWN_LAYOUTS,
  ALL_KNOWN_SLOTS,
  schemaFor,
  type LayoutName,
} from "./render/layoutSchemas";
import {
  parseAllFrontmatterBlocks,
  isInFrontmatter,
  currentSlideLayout,
  isInsideCodeFence,
  type EditorLike,
} from "./suggestHelpers";
import { TEMPLATES, findTemplate, locateCursor } from "./templates";

// ---------------------------------------------------------------------------
// LayoutNameSuggest
// ---------------------------------------------------------------------------

interface LayoutSuggestion {
  name: LayoutName;
  description: string;
}

export class LayoutNameSuggest extends EditorSuggest<LayoutSuggestion> {
  constructor(app: App) {
    super(app);
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    _file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const beforeCursor = line.substring(0, cursor.ch);
    // Match either the v0.7+ namespaced `slides-ng-layout:` OR the
    // legacy `layout:` (still supported for backward compat).
    const m = /^(?:slides-ng-layout|layout):\s*(\S*)$/.exec(beforeCursor);
    if (!m) return null;
    const blocks = parseAllFrontmatterBlocks(editor);
    if (!isInFrontmatter(blocks, cursor.line)) return null;
    const queryStart = beforeCursor.length - m[1].length;
    return {
      start: { line: cursor.line, ch: queryStart },
      end: cursor,
      query: m[1],
    };
  }

  getSuggestions(context: EditorSuggestContext): LayoutSuggestion[] {
    const q = context.query.toLowerCase();
    return KNOWN_LAYOUTS.filter((n) => n.toLowerCase().startsWith(q)).map(
      (n) => ({ name: n, description: LAYOUT_SCHEMAS[n].description })
    );
  }

  renderSuggestion(s: LayoutSuggestion, el: HTMLElement): void {
    el.empty();
    el.addClass("slides-ng-suggest");
    el.createEl("div", { text: s.name, cls: "slides-ng-suggest-title" });
    el.createEl("div", { text: s.description, cls: "slides-ng-suggest-note" });
  }

  selectSuggestion(s: LayoutSuggestion, _evt: MouseEvent | KeyboardEvent): void {
    if (!this.context) return;
    this.context.editor.replaceRange(
      s.name,
      this.context.start,
      this.context.end
    );
  }
}

// ---------------------------------------------------------------------------
// SlotMarkerSuggest
// ---------------------------------------------------------------------------

interface SlotSuggestion {
  kind: "slot" | "template";
  name: string;
  /** For slots: true if this slot is in the current layout's expected set. */
  forCurrentLayout?: boolean;
  /** For templates: short description for the dropdown sublabel. */
  description?: string;
}

export class SlotMarkerSuggest extends EditorSuggest<SlotSuggestion> {
  constructor(app: App) {
    super(app);
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    _file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const beforeCursor = line.substring(0, cursor.ch);
    // Start-of-line `::` followed by an optional partial name.
    const m = /^::([a-zA-Z][\w-]*)?$/.exec(beforeCursor);
    if (!m) return null;
    const blocks = parseAllFrontmatterBlocks(editor);
    if (isInFrontmatter(blocks, cursor.line)) return null;
    if (isInsideCodeFence(editor, cursor.line)) return null;
    const partial = m[1] ?? "";
    const queryStart = 2; // after the `::`
    return {
      start: { line: cursor.line, ch: queryStart },
      end: cursor,
      query: partial,
    };
  }

  getSuggestions(context: EditorSuggestContext): SlotSuggestion[] {
    const editor = context.editor as unknown as EditorLike;
    const blocks = parseAllFrontmatterBlocks(editor);
    const layout = currentSlideLayout(blocks, context.start.line);
    const schema = layout ? schemaFor(layout) : null;
    const expected = new Set(schema?.slots ?? []);
    const pool = expected.size > 0 ? Array.from(expected) : [...ALL_KNOWN_SLOTS];
    const query = context.query;

    // Build the candidate list ONCE, then score in a single O(N) pass.
    // For ~30-60 items this is microseconds — no index needed.
    interface Candidate { sugg: SlotSuggestion; haystack: string; defaultRank: number }
    const candidates: Candidate[] = [];
    let rank = 0;

    // Slots first in default rank so a no-query result lists slots
    // (which are layout-relevant) before templates.
    for (const name of pool) {
      candidates.push({
        sugg: { kind: "slot", name, forCurrentLayout: expected.has(name) },
        haystack: name,
        defaultRank: rank++,
      });
    }
    for (const t of TEMPLATES) {
      candidates.push({
        sugg: { kind: "template", name: t.name, description: t.description },
        // Include description in the haystack so fuzzy queries can
        // match by description words too ("warning" → "callout-warn").
        haystack: `${t.name} ${t.description}`,
        defaultRank: rank++,
      });
    }

    // Empty query → return everything in default order (slots first,
    // then templates by insertion order). Cheap fast path.
    if (!query) {
      return candidates.map((c) => c.sugg);
    }

    // v0.12.4: Obsidian's prepareFuzzySearch — same algorithm the
    // command palette uses. Returns a closure scoring each haystack.
    // Score is HIGHER for stronger matches (exact prefix > word-
    // boundary > scattered subsequence). Null = no match.
    const search = prepareFuzzySearch(query);
    interface Scored { sugg: SlotSuggestion; score: number; defaultRank: number }
    const scored: Scored[] = [];
    for (const c of candidates) {
      const result = search(c.haystack);
      if (result) scored.push({ sugg: c.sugg, score: result.score, defaultRank: c.defaultRank });
    }

    // Sort by score desc, ties broken by defaultRank (preserves
    // slot-before-template stability).
    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.defaultRank - b.defaultRank;
    });

    return scored.map((s) => s.sugg);
  }

  renderSuggestion(s: SlotSuggestion, el: HTMLElement): void {
    el.empty();
    el.addClass("slides-ng-suggest");
    // v0.12.4: visual chip distinguishes slot from snippet at-a-glance.
    // Both kinds get colour-coded so users can scan a long list.
    const titleRow = el.createDiv({ cls: "slides-ng-suggest-title-row" });
    const chip = titleRow.createSpan({
      cls: `slides-ng-suggest-chip slides-ng-suggest-chip-${s.kind}`,
      text: s.kind === "slot" ? "slot" : "snippet",
    });
    void chip; // ref to silence unused-var lint
    if (s.kind === "slot") {
      titleRow.createSpan({ text: `::${s.name}::`, cls: "slides-ng-suggest-title" });
      el.createEl("div", {
        text: s.forCurrentLayout
          ? "expected by current layout"
          : "not used by current layout",
        cls: "slides-ng-suggest-note",
      });
    } else {
      titleRow.createSpan({ text: `::${s.name}`, cls: "slides-ng-suggest-title" });
      el.createEl("div", {
        text: s.description ?? "",
        cls: "slides-ng-suggest-note",
      });
    }
  }

  selectSuggestion(s: SlotSuggestion, _evt: MouseEvent | KeyboardEvent): void {
    if (!this.context) return;
    const lineStart = { line: this.context.start.line, ch: 0 };
    if (s.kind === "slot") {
      // Replace the `::` plus query with `::name::` so the line ends as a
      // complete slot marker.
      this.context.editor.replaceRange(
        `::${s.name}::`,
        lineStart,
        this.context.end
      );
      return;
    }
    // Template: fully replace the `::name` typed text with the
    // template's expansion. Cursor lands at the template's marker.
    const template = findTemplate(s.name);
    if (!template) return;
    const { text, cursorOffset } = template.expand();
    this.context.editor.replaceRange(text, lineStart, this.context.end);
    const cursorPos = locateCursor(lineStart.line, text, cursorOffset);
    this.context.editor.setCursor(cursorPos);
  }
}

// ---------------------------------------------------------------------------
// VClickSuggest
// ---------------------------------------------------------------------------

interface VClickSuggestion {
  tag: string;
  description: string;
}

const V_CLICK_OPTIONS: VClickSuggestion[] = [
  { tag: "v-click", description: "Single click reveal (one element)" },
  { tag: "v-clicks", description: "Apply click reveals to each child element" },
];

export class VClickSuggest extends EditorSuggest<VClickSuggestion> {
  constructor(app: App) {
    super(app);
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    _file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const beforeCursor = line.substring(0, cursor.ch);
    // Match the partial open tag: `<v-` plus optional alphanumerics
    const m = /<v-([a-z]*)$/.exec(beforeCursor);
    if (!m) return null;
    const blocks = parseAllFrontmatterBlocks(editor);
    if (isInFrontmatter(blocks, cursor.line)) return null;
    if (isInsideCodeFence(editor, cursor.line)) return null;
    const partial = m[1] ?? "";
    const queryStart = beforeCursor.length - partial.length - 3; // `<v-` is 3 chars
    return {
      start: { line: cursor.line, ch: queryStart },
      end: cursor,
      query: partial,
    };
  }

  getSuggestions(context: EditorSuggestContext): VClickSuggestion[] {
    const q = context.query.toLowerCase();
    return V_CLICK_OPTIONS.filter((s) => s.tag.startsWith("v-" + q.replace(/^v-/, "")));
  }

  renderSuggestion(s: VClickSuggestion, el: HTMLElement): void {
    el.empty();
    el.addClass("slides-ng-suggest");
    el.createEl("div", {
      text: `<${s.tag}> ... </${s.tag}>`,
      cls: "slides-ng-suggest-title",
    });
    el.createEl("div", { text: s.description, cls: "slides-ng-suggest-note" });
  }

  selectSuggestion(s: VClickSuggestion, _evt: MouseEvent | KeyboardEvent): void {
    if (!this.context) return;
    // Insert the full open + close tag pair. Cursor lands between them so
    // the author can immediately type content.
    const open = `<${s.tag}>`;
    const close = `</${s.tag}>`;
    this.context.editor.replaceRange(
      `${open}${close}`,
      this.context.start,
      this.context.end
    );
    // Move cursor to between the tags.
    const cursorLine = this.context.start.line;
    const cursorCh = this.context.start.ch + open.length;
    this.context.editor.setCursor({ line: cursorLine, ch: cursorCh });
  }
}
