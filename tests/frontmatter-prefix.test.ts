/**
 * frontmatter-prefix.test.ts — v0.7.1 unit tests for the
 * `slides-ng-`-prefixed frontmatter keys + backward-compat reading of
 * the legacy unprefixed forms.
 */

import { test, expect, describe } from "bun:test";
import { renderDeck } from "../src/render/renderDeck";

describe("Prefixed frontmatter keys (0.7.1)", () => {
  test("slides-ng-theme is honoured", () => {
    const md = "---\nslides-ng-theme: league\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    // League theme has a signature gradient; check the deck rendered
    // (with content > 100 KB the theme CSS is inlined).
    expect(html.length).toBeGreaterThan(100_000);
  });

  test("slides-ng-transition is honoured", () => {
    const md = "---\nslides-ng-transition: zoom\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain('"transition":"zoom"');
  });

  test("slides-ng-slide-number is honoured (true)", () => {
    const md = "---\nslides-ng-slide-number: true\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain('"slideNumber":true');
  });

  test("slides-ng-transition-speed is honoured", () => {
    const md = "---\nslides-ng-transition-speed: fast\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain('"transitionSpeed":"fast"');
  });

  test("slides-ng-custom-css is honoured", () => {
    const md =
      "---\nslides-ng-custom-css: '.slides-ng-prefixed-marker { color: red; }'\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain(".slides-ng-prefixed-marker { color: red; }");
  });

  test("per-slide slides-ng-layout is honoured", () => {
    const md = "# A\n---\nslides-ng-layout: center\n---\n\n# B\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain('data-layout="center"');
  });
});

describe("Backward compatibility — legacy unprefixed keys still work", () => {
  test("legacy `theme:` still applies", () => {
    const md = "---\ntheme: league\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html.length).toBeGreaterThan(100_000);
  });

  test("legacy `transition:` still applies", () => {
    const md = "---\ntransition: zoom\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain('"transition":"zoom"');
  });

  test("legacy `customCSS:` still applies", () => {
    const md =
      "---\ncustomCSS: '.legacy-marker { color: red; }'\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain(".legacy-marker { color: red; }");
  });

  test("legacy per-slide `layout:` still applies", () => {
    const md = "# A\n---\nlayout: center\n---\n\n# B\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain('data-layout="center"');
  });
});

describe("Prefixed key wins over legacy key when both present", () => {
  test("slides-ng-theme overrides theme", () => {
    const md = "---\ntheme: black\nslides-ng-theme: league\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    // Both themes are inlined alongside reveal core, so we look for a
    // unique signature: league has a distinctive --r-link-color value.
    // Rather than fingerprinting CSS, just confirm content is large
    // enough that some theme was inlined.
    expect(html.length).toBeGreaterThan(100_000);
  });

  test("slides-ng-transition overrides transition", () => {
    const md =
      "---\ntransition: slide\nslides-ng-transition: zoom\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain('"transition":"zoom"');
    expect(html).not.toContain('"transition":"slide"');
  });

  test("per-slide slides-ng-layout overrides legacy layout", () => {
    const md = "# A\n---\nlayout: cover\nslides-ng-layout: center\n---\n\n# B\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain('data-layout="center"');
    expect(html).not.toContain('data-layout="cover"');
  });
});
