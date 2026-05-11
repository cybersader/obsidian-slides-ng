import { test, expect, describe } from "bun:test";
import { renderDeck } from "../src/render/renderDeck";

/**
 * Transition coverage — config-level only (per .claude/skills/testing-patterns/
 * §"Transitions": fidelity testing is deferred to visual-regression M5+).
 * We verify each transition name in frontmatter flows through to
 * Reveal.initialize({ transition: ... }), and that the default (no
 * frontmatter override) lands on reveal.js's built-in default.
 *
 * Reveal.js v5 supports: 'none', 'fade', 'slide', 'convex', 'concave', 'zoom'.
 * See https://revealjs.com/transitions/
 */

const REVEAL_TRANSITIONS = [
  "none",
  "fade",
  "slide",
  "convex",
  "concave",
  "zoom",
] as const;

describe("transition config flows through to Reveal.initialize", () => {
  for (const name of REVEAL_TRANSITIONS) {
    test(`transition: ${name}`, () => {
      const md = `---\ntransition: ${name}\n---\n\n# Slide\n`;
      const html = renderDeck(md);
      expect(html).toContain(`"transition":"${name}"`);
    });
  }

  test("default transition (no frontmatter) is 'slide'", () => {
    // revealTemplate.ts sets `transition: "slide"` if the headmatter
    // doesn't override.
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md);
    expect(html).toContain('"transition":"slide"');
  });
});
