/**
 * frontmatterOverrides.test.ts — v0.11.9 unit tests for the new
 * per-deck frontmatter "escape hatches" that override plugin settings.
 */

import { test, expect, describe } from "bun:test";
import { renderDeck } from "../src/render/renderDeck";

function deck(frontmatter: string): string {
  return `---\n${frontmatter}\n---\n\n# Slide\n\nbody`;
}

describe("frontmatter escape-hatches", () => {
  test("slides-ng-show-controls: true → reveal controls:true in iframe", () => {
    const html = renderDeck(deck("slides-ng-show-controls: true"));
    expect(html).toContain('"controls":true');
  });

  test("slides-ng-show-controls: false → reveal controls:false", () => {
    const html = renderDeck(deck("slides-ng-show-controls: false"));
    expect(html).toContain('"controls":false');
  });

  test("slides-ng-show-menu: false → menu plugin not bundled in iframe", () => {
    const html = renderDeck(deck("slides-ng-show-menu: false"));
    // When showMenu is false, the reveal-menu plugin script block is
    // omitted entirely — easier to detect by the registration step
    // (which is gated on `showMenu`).
    expect(html).not.toContain("(initOpts.plugins || []).concat([RevealMenu])");
  });

  test("slides-ng-magic-move-duration: 800 reaches the bootstrap", () => {
    const html = renderDeck(deck("slides-ng-magic-move-duration: 800"));
    expect(html).toContain("SLIDES_NG_MM_DURATION = 800");
  });

  test("slides-ng-line-step-dim: 0.5 reaches the iframe CSS", () => {
    const html = renderDeck(deck("slides-ng-line-step-dim: 0.5"));
    // The dim opacity is baked into a CSS variable.
    expect(html).toContain("0.5");
  });

  test("slides-ng-image-layout-split: 60/40 reaches the iframe", () => {
    const html = renderDeck(deck("slides-ng-image-layout-split: 60/40"));
    // The split ratio appears in the slot CSS grid template.
    expect(html).toMatch(/60.+40|60fr.+40fr/);
  });

  test("slides-ng-code-block-max-height: 40vh", () => {
    const html = renderDeck(deck('slides-ng-code-block-max-height: "40vh"'));
    expect(html).toContain("40vh");
  });

  test("slides-ng-reveal-config passthrough lands in Reveal.initialize", () => {
    const html = renderDeck(
      deck("slides-ng-reveal-config:\n  autoSlide: 5000\n  loop: true")
    );
    expect(html).toContain('"autoSlide":5000');
    expect(html).toContain('"loop":true');
  });

  test("invalid revealConfig (array) is ignored gracefully", () => {
    // Arrays are not objects → should NOT crash render; just skip.
    const html = renderDeck(deck("slides-ng-reveal-config:\n  - 1\n  - 2"));
    expect(html).toContain("class=\"reveal\"");
  });
});
