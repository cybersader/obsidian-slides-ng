import { describe, expect, it } from "bun:test";
import { slideIndexFromCursor } from "../src/parser/slideIndexFromCursor";

const FM_DECK = [
  "---",
  "theme: black",
  "---",
  "",
  "# Slide 1",
  "",
  "---",
  "",
  "# Slide 2",
  "",
  "---",
  "",
  "# Slide 3",
  "",
].join("\n");

describe("slideIndexFromCursor", () => {
  it("returns 0 inside frontmatter", () => {
    expect(slideIndexFromCursor(FM_DECK, 1)).toBe(0);
  });

  it("returns 0 on first slide body", () => {
    expect(slideIndexFromCursor(FM_DECK, 4)).toBe(0);
  });

  it("returns 1 after first slide separator", () => {
    expect(slideIndexFromCursor(FM_DECK, 8)).toBe(1);
  });

  it("returns 2 on third slide", () => {
    expect(slideIndexFromCursor(FM_DECK, 12)).toBe(2);
  });

  it("does not count `---` inside code fence", () => {
    const deck = [
      "# Slide 1",
      "",
      "```bash",
      "---",
      "echo hi",
      "```",
      "",
      "Still on slide 1",
    ].join("\n");
    expect(slideIndexFromCursor(deck, 7)).toBe(0);
  });

  it("works without frontmatter", () => {
    const deck = ["# Slide A", "---", "# Slide B", "---", "# Slide C"].join("\n");
    expect(slideIndexFromCursor(deck, 0)).toBe(0);
    expect(slideIndexFromCursor(deck, 2)).toBe(1);
    expect(slideIndexFromCursor(deck, 4)).toBe(2);
  });

  it("does not count vertical-slide `--` as horizontal separator", () => {
    const deck = ["# H1", "--", "## V1", "---", "# H2"].join("\n");
    expect(slideIndexFromCursor(deck, 2)).toBe(0);
    expect(slideIndexFromCursor(deck, 4)).toBe(1);
  });

  it("clamps to last slide when cursorLine exceeds doc length", () => {
    const deck = ["# A", "---", "# B"].join("\n");
    expect(slideIndexFromCursor(deck, 999)).toBe(1);
  });
});
