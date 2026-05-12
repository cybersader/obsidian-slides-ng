import { test, expect, describe } from "bun:test";
import {
  parseAllFrontmatterBlocks,
  isInFrontmatter,
  currentSlideLayout,
  isInsideCodeFence,
  type EditorLike,
} from "../src/suggestHelpers";

/** Minimal `EditorLike` over an array of lines. */
function fakeEditor(text: string): EditorLike {
  const lines = text.split("\n");
  return {
    lineCount: () => lines.length,
    getLine: (i: number) => lines[i] ?? "",
  };
}

describe("parseAllFrontmatterBlocks", () => {
  test("single deck-level frontmatter block", () => {
    const e = fakeEditor("---\ntheme: simple\n---\n\n# Slide\n");
    const blocks = parseAllFrontmatterBlocks(e);
    expect(blocks.length).toBe(1);
    expect(blocks[0].start).toBe(0);
    expect(blocks[0].end).toBe(2);
    expect(blocks[0].layout).toBeNull();
  });

  test("captures layout: from a block", () => {
    const e = fakeEditor("---\nlayout: cover\n---\n\n# Cover\n");
    const blocks = parseAllFrontmatterBlocks(e);
    expect(blocks[0].layout).toBe("cover");
  });

  test("multiple blocks (deck + per-slide)", () => {
    const e = fakeEditor(
      [
        "---",
        "theme: simple",
        "---",
        "",
        "---",
        "layout: two-cols",
        "---",
        "",
        "::left::",
        "L",
        "",
        "::right::",
        "R",
      ].join("\n")
    );
    const blocks = parseAllFrontmatterBlocks(e);
    expect(blocks.length).toBe(2);
    expect(blocks[0].layout).toBeNull();
    expect(blocks[1].layout).toBe("two-cols");
  });

  test("unclosed block at end-of-file (author still typing)", () => {
    // Splitting "---\nlayout: cover\n" on \n gives 3 lines (the trailing
    // empty string after the last newline), so end = lineCount - 1 = 2.
    const e = fakeEditor("---\nlayout: cover\n");
    const blocks = parseAllFrontmatterBlocks(e);
    expect(blocks.length).toBe(1);
    expect(blocks[0].layout).toBe("cover");
    expect(blocks[0].end).toBe(2);
  });
});

describe("isInFrontmatter", () => {
  test("cursor strictly inside a block returns true", () => {
    const e = fakeEditor("---\ntheme: simple\nlayout: cover\n---\n\n# Body\n");
    const blocks = parseAllFrontmatterBlocks(e);
    expect(isInFrontmatter(blocks, 1)).toBe(true);
    expect(isInFrontmatter(blocks, 2)).toBe(true);
  });

  test("cursor on the opening or closing `---` line returns false", () => {
    const e = fakeEditor("---\ntheme: simple\n---\n");
    const blocks = parseAllFrontmatterBlocks(e);
    expect(isInFrontmatter(blocks, 0)).toBe(false);
    expect(isInFrontmatter(blocks, 2)).toBe(false);
  });

  test("cursor in slide body returns false", () => {
    const e = fakeEditor("---\ntheme: simple\n---\n\n# Body\n");
    const blocks = parseAllFrontmatterBlocks(e);
    expect(isInFrontmatter(blocks, 4)).toBe(false);
  });
});

describe("currentSlideLayout", () => {
  test("returns the layout of the most recent preceding block", () => {
    const e = fakeEditor(
      [
        "---",          // 0
        "theme: simple",// 1
        "---",          // 2
        "",             // 3
        "---",          // 4
        "layout: cover",// 5
        "---",          // 6
        "",             // 7
        "# Cover slide",// 8
        "",             // 9
        "---",          // 10
        "layout: two-cols", // 11
        "---",          // 12
        "",             // 13
        "::left::",     // 14
        "left content", // 15
      ].join("\n")
    );
    const blocks = parseAllFrontmatterBlocks(e);
    // Cursor on the cover slide
    expect(currentSlideLayout(blocks, 8)).toBe("cover");
    // Cursor on the two-cols slide
    expect(currentSlideLayout(blocks, 15)).toBe("two-cols");
  });

  test("returns null if no layout has been declared", () => {
    const e = fakeEditor("---\ntheme: simple\n---\n\n# No layout here\n");
    const blocks = parseAllFrontmatterBlocks(e);
    expect(currentSlideLayout(blocks, 4)).toBeNull();
  });

  test("ignores blocks that don't precede the cursor", () => {
    const e = fakeEditor(
      [
        "---",
        "layout: cover",
        "---",
        "",
        "# At cover",
      ].join("\n")
    );
    const blocks = parseAllFrontmatterBlocks(e);
    // Cursor BEFORE the frontmatter (impossible in practice but the
    // helper should still return null rather than the upcoming layout).
    expect(currentSlideLayout(blocks, 0)).toBeNull();
  });
});

describe("isInsideCodeFence", () => {
  test("false outside any fence", () => {
    const e = fakeEditor("Hello\n\n# World\n");
    expect(isInsideCodeFence(e, 2)).toBe(false);
  });

  test("true inside ``` fence", () => {
    const e = fakeEditor(
      ["# Slide", "", "```ts", "const x = 1", "console.log(x)", "```", "", "After."].join("\n")
    );
    // Lines 3 and 4 are inside the fence.
    expect(isInsideCodeFence(e, 3)).toBe(true);
    expect(isInsideCodeFence(e, 4)).toBe(true);
    // Line 5 is the closing ``` (toggle happens before counting); line 7 is after.
    expect(isInsideCodeFence(e, 7)).toBe(false);
  });

  test("true inside ~~~ fence (tilde variant)", () => {
    const e = fakeEditor(["~~~", "body", "~~~"].join("\n"));
    expect(isInsideCodeFence(e, 1)).toBe(true);
  });

  test("nested fences: a `````` block ends the previous fence", () => {
    // Real markdown allows nested fences only with different lengths.
    // Our simple toggler treats every ``` as a state flip, which is
    // good enough for autocomplete-suppression heuristics.
    const e = fakeEditor(["```", "x", "```", "y"].join("\n"));
    expect(isInsideCodeFence(e, 1)).toBe(true);
    expect(isInsideCodeFence(e, 3)).toBe(false);
  });
});
