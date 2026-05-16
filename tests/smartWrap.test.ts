import { describe, expect, test } from "bun:test";
import {
  countChildSlots,
  parseSelection,
  smartWrap,
} from "../src/smartWrap";
import { TEMPLATES } from "../src/templates";

describe("parseSelection", () => {
  test("H1 + 2 H2 sections", () => {
    const s = [
      "# My Title",
      "",
      "## Left",
      "left body",
      "",
      "## Right",
      "right body",
    ].join("\n");
    const p = parseSelection(s);
    expect(p.title).toBe("My Title");
    expect(p.sections.length).toBe(2);
    expect(p.sections[0].heading).toBe("Left");
    expect(p.sections[0].body).toBe("left body");
    expect(p.sections[1].heading).toBe("Right");
    expect(p.sections[1].body).toBe("right body");
  });

  test("no H1, only H2s", () => {
    const s = "## A\n\nA body\n\n## B\n\nB body";
    const p = parseSelection(s);
    expect(p.title).toBeNull();
    expect(p.sections.length).toBe(2);
  });

  test("plain text with no headers", () => {
    const p = parseSelection("just a plain selection");
    expect(p.title).toBeNull();
    expect(p.sections.length).toBe(0);
  });

  test("H1 alone, no H2", () => {
    const p = parseSelection("# Just a title");
    expect(p.title).toBe("Just a title");
    expect(p.sections.length).toBe(0);
  });
});

/**
 * v0.13.0: smart-wrap operates on the SHORTCODE form (`::: …`)
 * because it detects child slots via `::::` open lines. Use
 * `expandShortcode()` in these tests since smart-wrap is only
 * meaningful when the user has opted into shortcode-mode snippets.
 */
function getShortcodeBody(name: string): { text: string; cursorOffset: number } {
  const tpl = TEMPLATES.find((t) => t.name === name)!;
  if (!tpl.expandShortcode) {
    throw new Error(`snippet "${name}" has no expandShortcode()`);
  }
  return tpl.expandShortcode();
}

describe("countChildSlots", () => {
  test("twocol has 2 child slots (shortcode form)", () => {
    expect(countChildSlots(getShortcodeBody("twocol").text)).toBe(2);
  });
  test("threecol has 3 child slots", () => {
    expect(countChildSlots(getShortcodeBody("threecol").text)).toBe(3);
  });
  test("callout has 0 child slots (single-slot snippet)", () => {
    expect(countChildSlots(getShortcodeBody("callout").text)).toBe(0);
  });
  test("hero has 0 child slots", () => {
    expect(countChildSlots(getShortcodeBody("hero").text)).toBe(0);
  });
  test("stat-grid has 3 child slots", () => {
    expect(countChildSlots(getShortcodeBody("stat-grid").text)).toBe(3);
  });
});

describe("smartWrap", () => {
  test("twocol + 2 H2 sections: distributes to slots", () => {
    const { text, cursorOffset } = getShortcodeBody("twocol");
    const selection = [
      "# Big Idea",
      "",
      "## Pros",
      "fast, cheap",
      "",
      "## Cons",
      "fragile",
    ].join("\n");
    const r = smartWrap(text, cursorOffset, selection);
    expect(r.applied).toBe(true);
    expect(r.text).toContain("::: twocol");
    expect(r.text).toContain("Big Idea");
    expect(r.text).toContain("## Pros");
    expect(r.text).toContain("fast, cheap");
    expect(r.text).toContain("## Cons");
    expect(r.text).toContain("fragile");
    expect(r.text.indexOf("Pros")).toBeLessThan(r.text.indexOf("Cons"));
  });

  test("threecol + 3 H2 sections: distributes to slots", () => {
    const { text, cursorOffset } = getShortcodeBody("threecol");
    const selection = "## A\n\nbody a\n\n## B\n\nbody b\n\n## C\n\nbody c";
    const r = smartWrap(text, cursorOffset, selection);
    expect(r.applied).toBe(true);
    expect(r.text).toContain("body a");
    expect(r.text).toContain("body b");
    expect(r.text).toContain("body c");
  });

  test("twocol + 3 H2 sections (mismatch): falls back to simple wrap", () => {
    const { text, cursorOffset } = getShortcodeBody("twocol");
    const selection = "## A\nbody\n## B\nbody\n## C\nbody";
    const r = smartWrap(text, cursorOffset, selection);
    expect(r.applied).toBe(false);
    expect(r.text).toContain(selection);
  });

  test("callout (0 slots) + 2 H2 sections: falls back to simple wrap", () => {
    const { text, cursorOffset } = getShortcodeBody("callout");
    const selection = "## A\nbody\n## B\nbody";
    const r = smartWrap(text, cursorOffset, selection);
    expect(r.applied).toBe(false);
  });

  test("plain selection (no H2): falls back to simple wrap", () => {
    const { text, cursorOffset } = getShortcodeBody("twocol");
    const r = smartWrap(text, cursorOffset, "just some text");
    expect(r.applied).toBe(false);
    expect(r.text).toContain("just some text");
  });

  test("HTML default (expand): no ::: slots → smartWrap falls back", () => {
    // Regression guard: when shortcode mode is OFF and snippets emit
    // raw HTML, smart-wrap can\'t find :::: slots so it MUST fall back
    // to simple wrap rather than crashing or doing nothing.
    const tpl = TEMPLATES.find((t) => t.name === "twocol")!;
    const { text, cursorOffset } = tpl.expand();
    expect(countChildSlots(text)).toBe(0);
    const r = smartWrap(text, cursorOffset, "## A\nx\n## B\ny");
    expect(r.applied).toBe(false);
  });
});
