/**
 * v0.13.0: verify the dual-form snippet system.
 *  - expand()           → raw HTML in source (default)
 *  - expandShortcode()  → Pandoc ::: form (experimental)
 *
 * Both should produce the same rendered HTML output when run through
 * the full renderDeck pipeline, but the SOURCE form differs.
 */
import { describe, expect, test } from "bun:test";
import { TEMPLATES } from "../src/templates";
import { renderDeckStandalone } from "../src/render/renderDeck";

const LAYOUT_SNIPPETS = [
  "hero", "twocol", "twocol-60", "threecol",
  "image-left", "image-right",
  "callout", "callout-warn", "callout-danger", "callout-success",
  "bignum", "stat-grid", "compare", "accent-box",
];

describe("snippet dual-form (HTML default + shortcode experimental)", () => {
  test("every layout snippet has both expand() and expandShortcode()", () => {
    for (const name of LAYOUT_SNIPPETS) {
      const tpl = TEMPLATES.find((t) => t.name === name);
      expect(tpl).toBeDefined();
      expect(typeof tpl!.expand).toBe("function");
      expect(typeof tpl!.expandShortcode).toBe("function");
    }
  });

  test("non-layout snippets only have expand() (no shortcode variant needed)", () => {
    const nonLayout = ["note", "v-clicks", "code-ts", "code-step"];
    for (const name of nonLayout) {
      const tpl = TEMPLATES.find((t) => t.name === name);
      expect(tpl).toBeDefined();
      expect(typeof tpl!.expand).toBe("function");
      expect(tpl!.expandShortcode).toBeUndefined();
    }
  });

  test("HTML expand() returns raw <div class='…'> wrappers", () => {
    for (const name of LAYOUT_SNIPPETS) {
      const tpl = TEMPLATES.find((t) => t.name === name)!;
      const { text } = tpl.expand();
      // Either bare class name or class with modifier (callout warn, etc.)
      // Either way starts with <div class=
      expect(text.startsWith("<div class=")).toBe(true);
      // No Pandoc fences in the default form.
      expect(text).not.toContain(":::");
    }
  });

  test("shortcode expandShortcode() returns ::: wrappers", () => {
    for (const name of LAYOUT_SNIPPETS) {
      const tpl = TEMPLATES.find((t) => t.name === name)!;
      const { text } = tpl.expandShortcode!();
      // Starts with ::: (possibly ::: name or ::: { .x })
      expect(text.startsWith(":::")).toBe(true);
      // No raw HTML wrapper in the shortcode form.
      expect(text).not.toMatch(/^<div/);
    }
  });

  test("both forms render to the same .className via renderDeckStandalone", () => {
    const cases = [
      { name: "hero", className: "hero" },
      { name: "twocol", className: "twocol" },
      { name: "callout", className: "callout" },
      { name: "bignum", className: "bignum" },
      { name: "accent-box", className: "accent-box" },
    ];
    for (const c of cases) {
      const tpl = TEMPLATES.find((t) => t.name === c.name)!;
      const htmlBody = tpl.expand().text.replace(/█/g, "x");
      const scBody = tpl.expandShortcode!().text.replace(/█/g, "x");
      const wrap = (body: string): string =>
        `---\ntitle: t\n---\n\n# slide\n\n${body}\n`;
      const htmlOut = renderDeckStandalone(wrap(htmlBody), "t.md", { defaultTheme: "black" });
      const scOut = renderDeckStandalone(wrap(scBody), "t.md", { defaultTheme: "black" });
      // Both rendered outputs should contain the same .className div.
      expect(htmlOut).toContain(`class="${c.className}"`);
      expect(scOut).toContain(`class="${c.className}"`);
      // Neither rendered output should leak ::: residue.
      // (The CSS contains "::: classname" in comments, so we look for
      // it OUTSIDE the <style> block by checking only the slide region.)
      const sliceFor = (full: string): string => {
        const a = full.indexOf("<h1>slide</h1>");
        const b = full.indexOf("</section>", a);
        return a < 0 || b < 0 ? full : full.slice(a, b);
      };
      expect(sliceFor(htmlOut)).not.toMatch(/:{3,}/);
      expect(sliceFor(scOut)).not.toMatch(/:{3,}/);
    }
  });
});
