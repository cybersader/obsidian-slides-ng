/**
 * autoH1Breaks.test.ts — v0.11.5 auto-slide-on-H1 unit tests.
 */

import { test, expect, describe } from "bun:test";
import {
  injectH1SlideBreaks,
  peekFrontmatterFlag,
  parseDeck,
} from "../src/parser/parseDeck";

describe("injectH1SlideBreaks", () => {
  test("leaves a single-H1 deck untouched", () => {
    const md = "# Only\n\nbody";
    expect(injectH1SlideBreaks(md)).toBe(md);
  });

  test("inserts `---` between two H1 sections", () => {
    const md = "# One\n\nbody\n\n# Two\n\nbody";
    const out = injectH1SlideBreaks(md);
    expect(out).toContain("\n---\n");
    expect(out.match(/^---$/gm)?.length).toBe(1);
  });

  test("does not double-insert when `---` already separates H1s", () => {
    const md = "# One\n\nbody\n\n---\n\n# Two";
    const out = injectH1SlideBreaks(md);
    expect(out.match(/^---$/gm)?.length).toBe(1);
  });

  test("preserves the first H1 (no break before it)", () => {
    const md = "# First\n\n# Second";
    const out = injectH1SlideBreaks(md);
    expect(out.startsWith("# First")).toBe(true);
  });

  test("skips the frontmatter block — no break inserted at top", () => {
    const md = "---\ntitle: x\n---\n\n# One\n\n# Two";
    const out = injectH1SlideBreaks(md);
    // Frontmatter preserved
    expect(out.startsWith("---\ntitle: x\n---\n")).toBe(true);
    // Only one break separating the two H1s
    const bodyLines = out.split("\n").filter((l) => l.trim() === "---");
    // 2 from frontmatter pair + 1 separator = 3
    expect(bodyLines.length).toBe(3);
  });

  test("does not insert breaks inside fenced code blocks", () => {
    const md = "# One\n\n```\n# Not a heading\n```\n\n# Two";
    const out = injectH1SlideBreaks(md);
    // Only one separator (between # One and # Two), the # inside the
    // fence is left alone.
    expect(out.match(/^---$/gm)?.length).toBe(1);
  });

  test("does not break on H2 / H3 headings", () => {
    const md = "# One\n\n## Sub\n\n### Subsub\n\n# Two";
    const out = injectH1SlideBreaks(md);
    expect(out.match(/^---$/gm)?.length).toBe(1);
  });
});

describe("peekFrontmatterFlag", () => {
  test("returns true for `slides-ng-auto-h1-breaks: true`", () => {
    const md = "---\nslides-ng-auto-h1-breaks: true\n---\n\n# x";
    expect(peekFrontmatterFlag(md, "slides-ng-auto-h1-breaks")).toBe(true);
  });

  test("returns false for `: false`", () => {
    const md = "---\nslides-ng-auto-h1-breaks: false\n---\n\n# x";
    expect(peekFrontmatterFlag(md, "slides-ng-auto-h1-breaks")).toBe(false);
  });

  test("returns undefined when key is absent", () => {
    const md = "---\nother: 1\n---\n\n# x";
    expect(peekFrontmatterFlag(md, "slides-ng-auto-h1-breaks")).toBe(undefined);
  });

  test("returns undefined when there's no frontmatter", () => {
    const md = "# heading";
    expect(peekFrontmatterFlag(md, "slides-ng-auto-h1-breaks")).toBe(undefined);
  });

  test("handles quoted values", () => {
    const md = "---\nslides-ng-auto-h1-breaks: 'yes'\n---";
    expect(peekFrontmatterFlag(md, "slides-ng-auto-h1-breaks")).toBe(true);
  });
});

describe("parseDeck with autoH1Breaks", () => {
  test("default (no opt-in) keeps original behavior — 1 slide", () => {
    const md = "# A\n\nbody\n\n# B\n\nbody";
    const deck = parseDeck(md);
    expect(deck.slides.length).toBe(1);
  });

  test("option enabled splits at every H1 — 2 slides", () => {
    const md = "# A\n\nbody\n\n# B\n\nbody";
    const deck = parseDeck(md, "deck.md", { autoH1Breaks: true });
    expect(deck.slides.length).toBe(2);
  });

  test("frontmatter flag overrides — true wins even when option false", () => {
    const md = "---\nslides-ng-auto-h1-breaks: true\n---\n\n# A\n\n# B";
    const deck = parseDeck(md, "deck.md", { autoH1Breaks: false });
    expect(deck.slides.length).toBe(2);
  });

  test("frontmatter flag overrides — false wins even when option true", () => {
    const md = "---\nslides-ng-auto-h1-breaks: false\n---\n\n# A\n\n# B";
    const deck = parseDeck(md, "deck.md", { autoH1Breaks: true });
    expect(deck.slides.length).toBe(1);
  });
});
