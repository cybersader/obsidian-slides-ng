import { test, expect, describe } from "bun:test";
import { splitSlots, hasSlots } from "../src/render/slots";

describe("splitSlots", () => {
  test("default slot when no markers", () => {
    const s = splitSlots("# Title\n\nBody.");
    expect(s.default).toBe("# Title\n\nBody.");
    expect(Object.keys(s)).toEqual(["default"]);
  });

  test("content before first marker is the default slot", () => {
    const s = splitSlots("intro\n\n::left::\n\nleft body");
    expect(s.default).toBe("intro");
    expect(s.left).toBe("left body");
  });

  test("left + right slots", () => {
    const md = `# Two-cols

::left::

Left side.

::right::

Right side.
`;
    const s = splitSlots(md);
    expect(s.default).toBe("# Two-cols");
    expect(s.left).toBe("Left side.");
    expect(s.right).toBe("Right side.");
  });

  test("markers are trimmed lines (whitespace tolerated)", () => {
    const s = splitSlots("::left::   \n\nbody");
    expect(s.left).toBe("body");
  });

  test("non-marker `::text::` inline does NOT split", () => {
    // `::name::` only counts at start-of-line.
    const s = splitSlots("Inline ::not-a-slot:: in a paragraph.");
    expect(s.default).toBe("Inline ::not-a-slot:: in a paragraph.");
    expect(s.left).toBeUndefined();
  });

  test("marker name must start with a letter", () => {
    const s = splitSlots("::42abc::\n\nbody");
    // The line `::42abc::` is NOT a valid marker — it stays in default.
    expect(s.default).toContain("::42abc::");
    expect(s["42abc"]).toBeUndefined();
  });

  test("supports kebab-case slot names", () => {
    const s = splitSlots("::two-cols-left::\n\nbody");
    expect(s["two-cols-left"]).toBe("body");
  });

  test("multiple sections of the same slot get appended in order", () => {
    // Edge case: defining `::left::` twice. Behaviour: subsequent
    // sections append to the same buffer (the marker just switches
    // `current`). Authors shouldn't rely on this.
    const s = splitSlots("::left::\n\nfirst\n\n::left::\n\nsecond");
    expect(s.left).toContain("first");
    expect(s.left).toContain("second");
  });
});

describe("hasSlots", () => {
  test("false when no markers", () => {
    expect(hasSlots("# Hello")).toBe(false);
  });
  test("true when a marker exists", () => {
    expect(hasSlots("# Hello\n\n::left::\n\nbody")).toBe(true);
  });
});
