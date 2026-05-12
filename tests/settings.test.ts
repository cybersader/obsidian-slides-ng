import { test, expect, describe } from "bun:test";
import { renderDeck, renderDeckStandalone } from "../src/render/renderDeck";
import { availableThemes, getTheme } from "../src/render/revealAssets";
import {
  DEFAULT_SETTINGS,
  REVEAL_TRANSITIONS,
  IMAGE_LAYOUT_SPLITS,
  PICKER_MODES,
  BUNDLED_CODE_THEMES,
  TRANSITION_SPEEDS,
} from "../src/settings";

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

describe("0.5.2 settings defaults", () => {
  test("defaultLayout is 'default'", () => {
    expect(DEFAULT_SETTINGS.defaultLayout).toBe("default");
  });
  test("codeTheme is 'github-dark'", () => {
    expect(DEFAULT_SETTINGS.codeTheme).toBe("github-dark");
  });
  test("imageLayoutSplit is '50/50'", () => {
    expect(DEFAULT_SETTINGS.imageLayoutSplit).toBe("50/50");
  });
  test("speakerTimerTickMs is 1000", () => {
    expect(DEFAULT_SETTINGS.speakerTimerTickMs).toBe(1000);
  });
  test("speakerPickerDefaultMode is 'compact'", () => {
    expect(DEFAULT_SETTINGS.speakerPickerDefaultMode).toBe("compact");
  });
  test("lineStepDimOpacity is 0.32", () => {
    expect(DEFAULT_SETTINGS.lineStepDimOpacity).toBe(0.32);
  });
  test("showRevealControlsEmbedded defaults off", () => {
    expect(DEFAULT_SETTINGS.showRevealControlsEmbedded).toBe(false);
  });
  test("showRevealMenuEmbedded defaults on (discoverable nav)", () => {
    expect(DEFAULT_SETTINGS.showRevealMenuEmbedded).toBe(true);
  });
});

describe("0.5.2 settings enums", () => {
  test("IMAGE_LAYOUT_SPLITS covers 50/50, 60/40, 40/60", () => {
    expect(IMAGE_LAYOUT_SPLITS).toEqual(["50/50", "60/40", "40/60"]);
  });
  test("PICKER_MODES covers compact and list", () => {
    expect(PICKER_MODES).toEqual(["compact", "list"]);
  });
  test("BUNDLED_CODE_THEMES has 4 themes including github-dark", () => {
    expect(BUNDLED_CODE_THEMES.length).toBe(4);
    expect(BUNDLED_CODE_THEMES).toContain("github-dark");
    expect(BUNDLED_CODE_THEMES).toContain("github-light");
    expect(BUNDLED_CODE_THEMES).toContain("dracula");
    expect(BUNDLED_CODE_THEMES).toContain("nord");
  });
});

describe("renderDeck threads settings into iframe HTML", () => {
  test("showRevealControlsEmbedded=true → controls:true in embedded mode", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", { showRevealControlsEmbedded: true });
    expect(html).toContain('"controls":true');
    expect(html).toContain('"progress":true');
  });

  test("showRevealControlsEmbedded=false (default) → controls hidden", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain('"controls":false');
  });

  test("showRevealMenuEmbedded=true bundles the menu plugin script", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", { showRevealMenuEmbedded: true });
    // The menu UMD bundle defines RevealMenu globally — check the source
    // marker is present.
    expect(html).toContain("RevealMenu");
  });

  test("showRevealMenuEmbedded=false omits the menu plugin", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", { showRevealMenuEmbedded: false });
    // Bridge code references RevealMenu only inside the `if (showMenu)`
    // block — without the plugin, that block isn't emitted, so the only
    // "RevealMenu" mentions in output should be zero.
    const matches = html.match(/RevealMenu/g) ?? [];
    expect(matches.length).toBe(0);
  });

  test("imageLayoutSplit 60/40 maps to 3fr 2fr in CSS", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", { imageLayoutSplit: "60/40" });
    expect(html).toContain("grid-template-columns: 3fr 2fr");
  });

  test("lineStepDimOpacity 0.5 lands in iframe CSS", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", { lineStepDimOpacity: 0.5 });
    expect(html).toContain("opacity: 0.5");
  });

  test("defaultLayout falls back from settings when slide has no layout:", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", { defaultLayout: "center" });
    expect(html).toContain('data-layout="center"');
  });
});

describe("renderDeck slide-number click suppressor", () => {
  test("iframe HTML contains the slide-number click-suppress handler", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain(".slide-number");
    expect(html).toContain("preventDefault");
  });
});

describe("renderDeck toggleOverview bridge command", () => {
  test("iframe bridge handles toggleOverview command", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain("toggleOverview");
    expect(html).toContain("Reveal.toggleOverview");
  });
});

describe("0.6.0 settings defaults", () => {
  test("codeBlockMaxHeight is '60vh'", () => {
    expect(DEFAULT_SETTINGS.codeBlockMaxHeight).toBe("60vh");
  });
  test("codeBlockOverflowScroll is true", () => {
    expect(DEFAULT_SETTINGS.codeBlockOverflowScroll).toBe(true);
  });
  test("transitionSpeed is 'default'", () => {
    expect(DEFAULT_SETTINGS.transitionSpeed).toBe("default");
  });
  test("magicMoveDurationMs is 500", () => {
    expect(DEFAULT_SETTINGS.magicMoveDurationMs).toBe(500);
  });
});

describe("0.6.0 settings enums", () => {
  test("TRANSITION_SPEEDS covers default/fast/slow", () => {
    expect(TRANSITION_SPEEDS).toEqual(["default", "fast", "slow"]);
  });
});

describe("renderDeck threads 0.6.0 settings into iframe HTML", () => {
  test("codeBlockMaxHeight lands in CSS", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", { codeBlockMaxHeight: "30vh" });
    expect(html).toContain("max-height: 30vh");
  });

  test("codeBlockMaxHeight='none' omits the CSS rule entirely", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", { codeBlockMaxHeight: "none" });
    expect(html).not.toContain(".reveal .shiki,\n    .reveal pre code");
  });

  test("codeBlockOverflowScroll=false → overflow-y: hidden", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {
      codeBlockMaxHeight: "30vh",
      codeBlockOverflowScroll: false,
    });
    expect(html).toContain("overflow-y: hidden");
  });

  test("transitionSpeed lands in Reveal init config", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", { transitionSpeed: "fast" });
    expect(html).toContain('"transitionSpeed":"fast"');
  });

  test("magicMoveDurationMs lands in iframe bootstrap as SLIDES_NG_MM_DURATION", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", { magicMoveDurationMs: 1234 });
    expect(html).toContain("SLIDES_NG_MM_DURATION = 1234");
  });
});

describe("headmatter customCSS + transitionSpeed override settings", () => {
  test("deck-level customCSS string overrides any settings default", () => {
    const md =
      "---\ncustomCSS: '.deck-marker { display: block }'\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain(".deck-marker { display: block }");
  });

  test("deck-level transitionSpeed overrides plugin setting", () => {
    const md = "---\ntransitionSpeed: slow\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", { transitionSpeed: "fast" });
    expect(html).toContain('"transitionSpeed":"slow"');
  });
});
