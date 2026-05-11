import { test, expect, describe } from "bun:test";
import { renderDeck } from "../src/render/renderDeck";
import { applyLayout, KNOWN_LAYOUTS, isKnownLayout } from "../src/render/layouts";

describe("applyLayout — layout dispatch", () => {
  test("default layout returns the default slot", () => {
    const html = applyLayout("default", { default: "<p>body</p>" });
    expect(html).toContain('data-layout="default"');
    expect(html).toContain("<p>body</p>");
  });

  test("two-cols emits a 2-column grid wrapper", () => {
    const html = applyLayout("two-cols", {
      default: "",
      left: "<p>L</p>",
      right: "<p>R</p>",
    });
    expect(html).toContain('data-layout="two-cols"');
    expect(html).toContain('class="slides-ng-cols-2"');
    expect(html).toContain("slides-ng-col-left");
    expect(html).toContain("slides-ng-col-right");
    expect(html).toContain("<p>L</p>");
    expect(html).toContain("<p>R</p>");
  });

  test("two-cols-header emits header + columns wrapper", () => {
    const html = applyLayout("two-cols-header", {
      default: "<h1>Header</h1>",
      left: "<p>L</p>",
      right: "<p>R</p>",
    });
    expect(html).toContain("slides-ng-cols-2-header");
    expect(html).toContain('class="slides-ng-header"');
    expect(html).toContain("<h1>Header</h1>");
    expect(html).toContain("<p>L</p>");
    expect(html).toContain("<p>R</p>");
  });

  test("cover wraps with .slides-ng-cover", () => {
    const html = applyLayout("cover", { default: "<h1>Cover</h1>" });
    expect(html).toContain('class="slides-ng-cover"');
  });

  test("center wraps with .slides-ng-center", () => {
    const html = applyLayout("center", { default: "<p>middle</p>" });
    expect(html).toContain('class="slides-ng-center"');
  });

  test("quote wraps with .slides-ng-quote", () => {
    const html = applyLayout("quote", { default: "<blockquote>q</blockquote>" });
    expect(html).toContain('class="slides-ng-quote"');
  });

  test("statement wraps with .slides-ng-statement", () => {
    const html = applyLayout("statement", { default: "<p>idea</p>" });
    expect(html).toContain('class="slides-ng-statement"');
  });

  test("section wraps with .slides-ng-section", () => {
    const html = applyLayout("section", { default: "<h1>Part II</h1>" });
    expect(html).toContain('class="slides-ng-section"');
  });

  test("end wraps with .slides-ng-end", () => {
    const html = applyLayout("end", { default: "<h1>Fin</h1>" });
    expect(html).toContain('class="slides-ng-end"');
  });

  test("unknown layout falls back to default", () => {
    const html = applyLayout("not-a-real-layout", { default: "<p>body</p>" });
    // The data-layout attr keeps the requested name (preserves intent
    // for debugging), but the inner structure is the default layout.
    expect(html).toContain('data-layout="not-a-real-layout"');
    expect(html).toContain("<p>body</p>");
  });
});

describe("KNOWN_LAYOUTS / isKnownLayout", () => {
  test("ships 9 layouts", () => {
    expect(KNOWN_LAYOUTS.length).toBe(9);
  });
  test("includes the headline ones", () => {
    expect(KNOWN_LAYOUTS).toContain("default");
    expect(KNOWN_LAYOUTS).toContain("two-cols");
    expect(KNOWN_LAYOUTS).toContain("cover");
    expect(KNOWN_LAYOUTS).toContain("end");
  });
  test("isKnownLayout type-guards correctly", () => {
    expect(isKnownLayout("two-cols")).toBe(true);
    expect(isKnownLayout("two-cols-header")).toBe(true);
    expect(isKnownLayout("nope")).toBe(false);
  });
});

describe("layouts — end-to-end through renderDeck", () => {
  test("layout: two-cols slide splits on ::left:: and ::right::", () => {
    const md =
      "---\n---\n\n" +
      "---\nlayout: two-cols\n---\n\n" +
      "::left::\n\nLeft\n\n::right::\n\nRight\n";
    const html = renderDeck(md);
    expect(html).toContain('data-layout="two-cols"');
    expect(html).toContain('class="slides-ng-cols-2"');
    expect(html).toContain("Left");
    expect(html).toContain("Right");
  });

  test("layout: cover renders centered title", () => {
    const md = "---\n---\n\n---\nlayout: cover\n---\n\n# Title\n";
    const html = renderDeck(md);
    expect(html).toContain('data-layout="cover"');
    expect(html).toContain('class="slides-ng-cover"');
    expect(html).toContain("<h1>Title</h1>");
  });

  test("slide WITHOUT layout: frontmatter still renders cleanly", () => {
    const md = "---\n---\n\n# Plain\n\nBody.\n";
    const html = renderDeck(md);
    // No layout marker on a slide that didn't ask for one — still flows
    // through the default layout for consistency.
    expect(html).toContain('data-layout="default"');
    expect(html).toContain("<h1>Plain</h1>");
  });

  test("v-clicks inside ::left:: stay scoped to that slot's HTML", () => {
    const md =
      "---\n---\n\n" +
      "---\nlayout: two-cols\n---\n\n" +
      "::left::\n\n<v-clicks>\n\n- A\n- B\n\n</v-clicks>\n\n" +
      "::right::\n\nStatic right.\n";
    const html = renderDeck(md);
    // The fragments should appear inside the left column.
    const leftStart = html.indexOf('slides-ng-col-left">');
    const leftEnd = html.indexOf('slides-ng-col-right">');
    expect(leftStart).toBeGreaterThan(-1);
    expect(leftEnd).toBeGreaterThan(leftStart);
    const leftSegment = html.substring(leftStart, leftEnd);
    expect(leftSegment).toContain('class="fragment"');
  });
});
