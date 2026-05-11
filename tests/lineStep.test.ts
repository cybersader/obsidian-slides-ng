import { test, expect, describe } from "bun:test";
import { parseLineStep } from "../src/parser/lineStep";

describe("parseLineStep — bracket forms", () => {
  test("square-bracket form `[1|2-3|all]`", () => {
    const r = parseLineStep("ts [1|2-3|all]");
    expect(r).not.toBeNull();
    expect(r!.lang).toBe("ts");
    expect(r!.steps.length).toBe(3);
  });

  test("curly-bracket form `{1|2-3|all}`", () => {
    const r = parseLineStep("ts {1|2-3|all}");
    expect(r).not.toBeNull();
    expect(r!.lang).toBe("ts");
    expect(r!.steps.length).toBe(3);
  });

  test("mismatched brackets return null", () => {
    expect(parseLineStep("ts [1|2-3}")).toBeNull();
    expect(parseLineStep("ts {1|2-3]")).toBeNull();
  });

  test("no brackets returns null (plain lang)", () => {
    expect(parseLineStep("ts")).toBeNull();
    expect(parseLineStep("typescript")).toBeNull();
    expect(parseLineStep("")).toBeNull();
  });
});

describe("parseLineStep — step tokens", () => {
  test("single line `1`", () => {
    const r = parseLineStep("ts [1]");
    expect(Array.from(r!.steps[0].lines!).sort()).toEqual([1]);
  });

  test("range `2-4`", () => {
    const r = parseLineStep("ts [2-4]");
    expect(Array.from(r!.steps[0].lines!).sort((a, b) => a - b)).toEqual([2, 3, 4]);
  });

  test("`all` and `*` produce a no-dim step (lines === null)", () => {
    const r1 = parseLineStep("ts [all]");
    const r2 = parseLineStep("ts [*]");
    expect(r1!.steps[0].lines).toBeNull();
    expect(r2!.steps[0].lines).toBeNull();
  });

  test("comma list `1,3,5`", () => {
    const r = parseLineStep("ts [1,3,5]");
    expect(Array.from(r!.steps[0].lines!).sort((a, b) => a - b)).toEqual([1, 3, 5]);
  });

  test("step sequence `1|2-3|all`", () => {
    const r = parseLineStep("ts [1|2-3|all]");
    expect(r!.steps[0].lines).toEqual(new Set([1]));
    expect(Array.from(r!.steps[1].lines!).sort()).toEqual([2, 3]);
    expect(r!.steps[2].lines).toBeNull();
  });

  test("malformed step token rejects the whole spec", () => {
    expect(parseLineStep("ts [1|abc|3]")).toBeNull();
    expect(parseLineStep("ts [0]")).toBeNull(); // line 0 is invalid
    expect(parseLineStep("ts [3-1]")).toBeNull(); // hi < lo
  });

  test("non-line-step bracket content returns null", () => {
    // `{monaco-diff}` is a Slidev marker for diff mode — not a line-step.
    expect(parseLineStep("ts {monaco-diff}")).toBeNull();
  });
});

describe("parseLineStep — raw preserved", () => {
  test("each step keeps its source token for debugging", () => {
    const r = parseLineStep("ts [1|2-3|all]");
    expect(r!.steps.map((s) => s.raw)).toEqual(["1", "2-3", "all"]);
  });
});
