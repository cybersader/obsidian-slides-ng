/**
 * Pure helpers for the EditorSuggest classes in SlidesNGSuggest.ts.
 *
 * Extracted into its own file so unit tests can import without pulling in
 * `obsidian` (which is a runtime-injected types-only package at test time).
 */

export interface FrontmatterBlock {
  /** Line index of the opening `---`. */
  start: number;
  /** Line index of the closing `---`. */
  end: number;
  /** Parsed `layout:` value from this block, or null. */
  layout: string | null;
}

/** Subset of Obsidian's Editor we actually use — easier to unit-test. */
export interface EditorLike {
  lineCount(): number;
  getLine(line: number): string;
}

/**
 * Scan the editor for all `---`-bounded frontmatter blocks, top to bottom.
 * Returns each block with parsed `layout:` value. A trailing `---` with no
 * closing `---` is treated as an open (unclosed) block and gets
 * `end = lineCount - 1` so inside-frontmatter detection still works while
 * the author is typing.
 */
export function parseAllFrontmatterBlocks(
  editor: EditorLike
): FrontmatterBlock[] {
  const blocks: FrontmatterBlock[] = [];
  const totalLines = editor.lineCount();
  let openLine = -1;
  for (let i = 0; i < totalLines; i++) {
    if (editor.getLine(i).trim() === "---") {
      if (openLine === -1) {
        openLine = i;
      } else {
        let layout: string | null = null;
        for (let k = openLine + 1; k < i; k++) {
          const m = /^(?:slides-ng-layout|layout):\s*(\S+)/.exec(editor.getLine(k));
          if (m) {
            layout = m[1].trim();
            break;
          }
        }
        blocks.push({ start: openLine, end: i, layout });
        openLine = -1;
      }
    }
  }
  if (openLine !== -1) {
    let layout: string | null = null;
    for (let k = openLine + 1; k < totalLines; k++) {
      const m = /^(?:slides-ng-layout|layout):\s*(\S+)/.exec(editor.getLine(k));
      if (m) {
        layout = m[1].trim();
        break;
      }
    }
    blocks.push({ start: openLine, end: totalLines - 1, layout });
  }
  return blocks;
}

/**
 * Is the cursor currently inside any frontmatter block?
 * Strictly inside — not on the opening or closing `---` line.
 */
export function isInFrontmatter(
  blocks: readonly FrontmatterBlock[],
  cursorLine: number
): boolean {
  for (const b of blocks) {
    if (cursorLine > b.start && cursorLine < b.end) return true;
  }
  return false;
}

/**
 * Walking backward from the cursor, find the most recent frontmatter block
 * with a `layout:` value. Used by SlotMarkerSuggest to filter suggestions
 * by the current slide's layout.
 */
export function currentSlideLayout(
  blocks: readonly FrontmatterBlock[],
  cursorLine: number
): string | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].end < cursorLine && blocks[i].layout) {
      return blocks[i].layout;
    }
  }
  return null;
}

/**
 * Is the cursor inside a fenced code block? Scans from start of file to
 * the cursor, toggling on every line whose trimmed form starts with
 * ` ``` ` or `~~~`. Used to suppress autocomplete inside code blocks
 * (we don't want the `::` menu firing while someone types a code sample).
 */
export function isInsideCodeFence(
  editor: EditorLike,
  cursorLine: number
): boolean {
  let inside = false;
  for (let i = 0; i < cursorLine; i++) {
    const line = editor.getLine(i).trim();
    if (line.startsWith("```") || line.startsWith("~~~")) inside = !inside;
  }
  return inside;
}
