import { test, expect, describe } from "bun:test";
import {
  findSlideRanges,
  readSlideNotes,
  replaceSlideNotes,
} from "../src/parser/editSlideNotes";

const DECK = [
  "---",
  "theme: black",
  "---",
  "",
  "# Slide 1",
  "",
  "Content A",
  "",
  "<!-- note for slide 1 -->",
  "",
  "---",
  "",
  "# Slide 2",
  "",
  "Content B",
  "",
  "---",
  "",
  "# Slide 3",
  "",
  "Content C",
  "",
  "<!-- slide data-auto-animate -->",
  "<!-- last note -->",
  "",
].join("\n");

describe("findSlideRanges", () => {
  test("returns one range per slide (skipping frontmatter)", () => {
    const ranges = findSlideRanges(DECK);
    expect(ranges.length).toBe(3);
  });

  test("excludes the YAML frontmatter from the first slide's range", () => {
    const ranges = findSlideRanges(DECK);
    // Line 3 is the closing `---`; first slide starts at line 4.
    expect(ranges[0].startLine).toBe(3);
  });

  test("works without frontmatter", () => {
    const deck = "# A\n---\n# B";
    const ranges = findSlideRanges(deck);
    expect(ranges.length).toBe(2);
  });

  test("ignores `---` inside code fences", () => {
    const deck = "# Slide 1\n```\n---\n```\n# Still slide 1";
    const ranges = findSlideRanges(deck);
    expect(ranges.length).toBe(1);
  });
});

describe("readSlideNotes", () => {
  test("reads the trailing comment as notes", () => {
    expect(readSlideNotes(DECK, 0)).toBe("note for slide 1");
  });

  test("returns empty string for a slide with no notes", () => {
    expect(readSlideNotes(DECK, 1)).toBe("");
  });

  test("returns the LAST comment when annotations precede it", () => {
    expect(readSlideNotes(DECK, 2)).toBe("last note");
  });

  test("returns empty for out-of-range index", () => {
    expect(readSlideNotes(DECK, 99)).toBe("");
    expect(readSlideNotes(DECK, -1)).toBe("");
  });
});

describe("replaceSlideNotes — replace existing", () => {
  test("replaces the existing comment in-place", () => {
    const updated = replaceSlideNotes(DECK, 0, "new note");
    expect(updated).toContain("<!-- new note -->");
    expect(updated).not.toContain("<!-- note for slide 1 -->");
  });

  test("preserves all other slides verbatim", () => {
    const updated = replaceSlideNotes(DECK, 0, "X");
    expect(updated).toContain("# Slide 2");
    expect(updated).toContain("Content B");
    expect(updated).toContain("# Slide 3");
    expect(updated).toContain("<!-- last note -->");
  });

  test("trims leading/trailing whitespace in new notes", () => {
    const updated = replaceSlideNotes(DECK, 0, "   spaced  ");
    expect(updated).toContain("<!-- spaced -->");
  });

  test("flattens newlines to single spaces (single-line comment format)", () => {
    const updated = replaceSlideNotes(DECK, 0, "line one\nline two");
    expect(updated).toContain("<!-- line one line two -->");
  });

  test("empty newNotes removes the comment line entirely", () => {
    const updated = replaceSlideNotes(DECK, 0, "");
    expect(updated).not.toContain("note for slide 1");
    // Slide 1 content should still be intact.
    expect(updated).toContain("# Slide 1");
    expect(updated).toContain("Content A");
  });
});

describe("replaceSlideNotes — insert new", () => {
  test("inserts a comment when no notes exist on the target slide", () => {
    const updated = replaceSlideNotes(DECK, 1, "added later");
    expect(updated).toContain("<!-- added later -->");
    // It should appear AFTER Content B and BEFORE the next `---`.
    const updatedLines = updated.split("\n");
    const noteIdx = updatedLines.findIndex((l) => l.trim() === "<!-- added later -->");
    const contentBIdx = updatedLines.findIndex((l) => l.trim() === "Content B");
    expect(noteIdx).toBeGreaterThan(contentBIdx);
  });

  test("does NOT touch the slide annotation comment when inserting near it", () => {
    const updated = replaceSlideNotes(DECK, 2, "replacement note");
    expect(updated).toContain("<!-- slide data-auto-animate -->");
    expect(updated).toContain("<!-- replacement note -->");
    expect(updated).not.toContain("<!-- last note -->");
  });

  test("inserting into a slide with no trailing newline still works", () => {
    const deck = "# Slide 1\nContent\n---\n# Slide 2\nMore";
    const updated = replaceSlideNotes(deck, 1, "tail note");
    expect(updated).toContain("<!-- tail note -->");
  });

  test("empty newNotes on a slide with no notes is a no-op", () => {
    const before = DECK;
    const after = replaceSlideNotes(DECK, 1, "");
    expect(after).toBe(before);
  });
});

describe("replaceSlideNotes — auto-h1-breaks decks (v0.11.14)", () => {
  // User-reported bug: editing notes on a deck that uses
  // `slides-ng-auto-h1-breaks: true` and no `---` separators
  // silently does nothing. Cause: findSlideRanges only counts `---`
  // separators and sees the whole deck as one slide, so any
  // currentIdx > 0 is out of range. Need to apply the auto-h1-
  // breaks transformation before slicing.
  const AUTO_DECK = [
    "---",
    "slides-ng-auto-h1-breaks: true",
    "---",
    "",
    "# Slide A",
    "",
    "body A",
    "",
    "# Slide B",
    "",
    "body B",
    "",
    "# Slide C",
    "",
    "body C",
  ].join("\n");

  test("inserts a note on the SECOND slide (idx 1) of an auto-h1-breaks deck", () => {
    const updated = replaceSlideNotes(AUTO_DECK, 1, "note for B");
    expect(updated).toContain("<!-- note for B -->");
    // The note must appear AFTER `body B` and BEFORE `# Slide C`.
    const lines = updated.split("\n");
    const noteIdx = lines.findIndex((l) => l.trim() === "<!-- note for B -->");
    const bodyBIdx = lines.findIndex((l) => l.trim() === "body B");
    const slideCIdx = lines.findIndex((l) => l.trim() === "# Slide C");
    expect(noteIdx).toBeGreaterThan(bodyBIdx);
    expect(noteIdx).toBeLessThan(slideCIdx);
  });

  test("inserts a note on the THIRD slide (idx 2) of an auto-h1-breaks deck", () => {
    const updated = replaceSlideNotes(AUTO_DECK, 2, "note for C");
    expect(updated).toContain("<!-- note for C -->");
    // The note must appear AFTER `body C` (at end of file).
    const lines = updated.split("\n");
    const noteIdx = lines.findIndex((l) => l.trim() === "<!-- note for C -->");
    const bodyCIdx = lines.findIndex((l) => l.trim() === "body C");
    expect(noteIdx).toBeGreaterThan(bodyCIdx);
  });

  test("readSlideNotes correctly extracts notes from an auto-h1-breaks deck slide", () => {
    const deckWithNote = [
      "---",
      "slides-ng-auto-h1-breaks: true",
      "---",
      "",
      "# A",
      "<!-- note A -->",
      "",
      "# B",
      "<!-- note B -->",
    ].join("\n");
    expect(readSlideNotes(deckWithNote, 0)).toBe("note A");
    expect(readSlideNotes(deckWithNote, 1)).toBe("note B");
  });
});

describe("replaceSlideNotes — out-of-range indices", () => {
  test("idx ≥ slideCount returns original markdown unchanged", () => {
    expect(replaceSlideNotes(DECK, 99, "x")).toBe(DECK);
  });
  test("idx < 0 returns original markdown unchanged", () => {
    expect(replaceSlideNotes(DECK, -1, "x")).toBe(DECK);
  });
});
