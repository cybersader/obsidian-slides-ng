import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { highlight, isWarm, warmHighlighter, _resetForTest } from "../src/render/shiki";

describe("shiki highlighter", () => {
  describe("before warm", () => {
    afterAll(() => _resetForTest());

    test("falls back to escaped <pre><code> when not yet warm", () => {
      _resetForTest();
      expect(isWarm()).toBe(false);
      const out = highlight("const x = 1", "typescript");
      expect(out).toContain("<pre><code");
      expect(out).toContain("const x = 1");
      // No Shiki markup until warm.
      expect(out).not.toContain('class="shiki');
    });

    test("escapes HTML in the fallback", () => {
      _resetForTest();
      const out = highlight('<script>alert("x")</script>', "html");
      expect(out).toContain("&lt;script&gt;");
      expect(out).not.toContain("<script>alert");
    });
  });

  describe("after warm", () => {
    beforeAll(async () => {
      _resetForTest();
      await warmHighlighter();
    });

    test("warming flips isWarm() to true", () => {
      expect(isWarm()).toBe(true);
    });

    test("produces Shiki-styled output for typescript", () => {
      const out = highlight("const x = 1", "typescript");
      expect(out).toContain('class="shiki');
      expect(out).toContain("github-dark");
      // The actual color tokens are inline-styled.
      expect(out).toContain("color");
    });

    test("falls back to plaintext for unknown langs", () => {
      const out = highlight("something exotic", "klingon");
      // Plaintext rendering still produces a Shiki <pre>, just without
      // syntax highlighting tokens.
      expect(out).toContain('class="shiki');
    });

    test("handles undefined lang", () => {
      const out = highlight("plain text", undefined);
      expect(out).toContain('class="shiki');
    });
  });
});
