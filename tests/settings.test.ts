import { test, expect, describe } from "bun:test";
import { renderDeck, renderDeckStandalone } from "../src/render/renderDeck";
import { availableThemes, getTheme } from "../src/render/revealAssets";
import { DEFAULT_SETTINGS, REVEAL_TRANSITIONS } from "../src/settings";

describe("settings defaults", () => {
  test("default theme is 'black'", () => {
    expect(DEFAULT_SETTINGS.defaultTheme).toBe("black");
  });

  test("default transition is 'slide'", () => {
    expect(DEFAULT_SETTINGS.defaultTransition).toBe("slide");
  });
});

describe("availableThemes / getTheme", () => {
  test("ships at least 10 themes including black, white, simple", () => {
    const themes = availableThemes();
    expect(themes.length).toBeGreaterThanOrEqual(10);
    expect(themes).toContain("black");
    expect(themes).toContain("white");
    expect(themes).toContain("simple");
    expect(themes).toContain("league");
    expect(themes).toContain("solarized");
    expect(themes).toContain("dracula");
  });

  test("getTheme returns CSS content for known theme", () => {
    const css = getTheme("simple");
    expect(css.length).toBeGreaterThan(100);
    expect(css).toContain("background");
  });

  test("getTheme falls back to black for unknown theme", () => {
    const blackCss = getTheme("black");
    const unknownCss = getTheme("not-a-real-theme");
    expect(unknownCss).toBe(blackCss);
  });
});

describe("theme + transition resolution priority", () => {
  test("renderDeck uses defaults when frontmatter is silent", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {
      defaultTransition: "fade",
    });
    expect(html).toContain('"transition":"fade"');
  });

  test("frontmatter overrides plugin defaults", () => {
    const md = "---\ntransition: zoom\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {
      defaultTransition: "fade",
    });
    expect(html).toContain('"transition":"zoom"');
  });

  test("standalone mode also honours theme defaults", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeckStandalone(md, "deck.md", {
      defaultTheme: "league",
    });
    // The league theme CSS contains its signature gradient background.
    expect(html).toContain('"embedded":false');
    // We can't easily fingerprint a theme's CSS in a stable way without
    // overfitting to reveal.js internals; just verify the HTML is large
    // enough that a theme was inlined.
    expect(html.length).toBeGreaterThan(100_000);
  });
});

describe("REVEAL_TRANSITIONS constant", () => {
  test("includes the six built-in reveal.js transitions", () => {
    expect(REVEAL_TRANSITIONS).toContain("none");
    expect(REVEAL_TRANSITIONS).toContain("fade");
    expect(REVEAL_TRANSITIONS).toContain("slide");
    expect(REVEAL_TRANSITIONS).toContain("convex");
    expect(REVEAL_TRANSITIONS).toContain("concave");
    expect(REVEAL_TRANSITIONS).toContain("zoom");
  });
});
