import { test, expect, describe } from "bun:test";
import { parseDeck } from "../src/parser/parseDeck";

describe("parseDeck", () => {
  test("splits on `---` horizontal separators", () => {
    const md = `---
theme: simple
---

# First

Hello

---

# Second

World
`;
    const deck = parseDeck(md);
    expect(deck.slides.length).toBe(2);
  });

  test("extracts deck-level frontmatter (headmatter)", () => {
    const md = `---
theme: simple
transition: fade
---

# Title
`;
    const deck = parseDeck(md);
    expect(deck.headmatter.theme).toBe("simple");
    expect(deck.headmatter.transition).toBe("fade");
  });

  test("extracts speaker notes from HTML comments", () => {
    const md = `---
---

# First

Body content.

<!--
This is a speaker note.
-->
`;
    const deck = parseDeck(md);
    const note = deck.slides[0].note ?? "";
    expect(note).toContain("speaker note");
  });

  test("handles a 6-slide deck end to end", () => {
    const md = `---
theme: simple
---

# A

---

# B

---

# C

---

# D

---

# E

---

# F
`;
    const deck = parseDeck(md);
    expect(deck.slides.length).toBe(6);
    expect(deck.errors.length).toBe(0);
  });
});
