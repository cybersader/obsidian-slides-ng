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

describe("countChildSlots", () => {
  test("twocol has 2 child slots", () => {
    const tpl = TEMPLATES.find((t) => t.name === "twocol");
    const { text } = tpl!.expand();
    expect(countChildSlots(text)).toBe(2);
  });
  test("threecol has 3 child slots", () => {
    const tpl = TEMPLATES.find((t) => t.name === "threecol");
    const { text } = tpl!.expand();
    expect(countChildSlots(text)).toBe(3);
  });
  test("callout has 0 child slots (single-slot snippet)", () => {
    const tpl = TEMPLATES.find((t) => t.name === "callout");
    const { text } = tpl!.expand();
    expect(countChildSlots(text)).toBe(0);
  });
  test("hero has 0 child slots", () => {
    const tpl = TEMPLATES.find((t) => t.name === "hero");
    const { text } = tpl!.expand();
    expect(countChildSlots(text)).toBe(0);
  });
  test("stat-grid has 3 child slots", () => {
    const tpl = TEMPLATES.find((t) => t.name === "stat-grid");
    const { text } = tpl!.expand();
    expect(countChildSlots(text)).toBe(3);
  });
});

describe("smartWrap", () => {
  test("twocol + 2 H2 sections: distributes to slots", () => {
    const tpl = TEMPLATES.find((t) => t.name === "twocol")!;
    const { text, cursorOffset } = tpl.expand();
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
    // Pros should appear before Cons (slot order preserved)
    expect(r.text.indexOf("Pros")).toBeLessThan(r.text.indexOf("Cons"));
  });

  test("threecol + 3 H2 sections: distributes to slots", () => {
    const tpl = TEMPLATES.find((t) => t.name === "threecol")!;
    const { text, cursorOffset } = tpl.expand();
    const selection = "## A\n\nbody a\n\n## B\n\nbody b\n\n## C\n\nbody c";
    const r = smartWrap(text, cursorOffset, selection);
    expect(r.applied).toBe(true);
    expect(r.text).toContain("body a");
    expect(r.text).toContain("body b");
    expect(r.text).toContain("body c");
  });

  test("twocol + 3 H2 sections (mismatch): falls back to simple wrap", () => {
    const tpl = TEMPLATES.find((t) => t.name === "twocol")!;
    const { text, cursorOffset } = tpl.expand();
    const selection = "## A\nbody\n## B\nbody\n## C\nbody";
    const r = smartWrap(text, cursorOffset, selection);
    expect(r.applied).toBe(false);
    // Fallback puts whole selection at cursor marker
    expect(r.text).toContain(selection);
  });

  test("callout (0 slots) + 2 H2 sections: falls back to simple wrap", () => {
    const tpl = TEMPLATES.find((t) => t.name === "callout")!;
    const { text, cursorOffset } = tpl.expand();
    const selection = "## A\nbody\n## B\nbody";
    const r = smartWrap(text, cursorOffset, selection);
    expect(r.applied).toBe(false);
  });

  test("plain selection (no H2): falls back to simple wrap", () => {
    const tpl = TEMPLATES.find((t) => t.name === "twocol")!;
    const { text, cursorOffset } = tpl.expand();
    const r = smartWrap(text, cursorOffset, "just some text");
    expect(r.applied).toBe(false);
    expect(r.text).toContain("just some text");
  });
});
