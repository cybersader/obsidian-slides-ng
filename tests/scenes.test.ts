/**
 * scenes.test.ts — v0.7.0 unit tests for the scenes (placeholder
 * overlay) system.
 */

import { test, expect, describe } from "bun:test";
import { DEFAULT_SCENES, DEFAULT_SETTINGS } from "../src/settings";
import { renderDeck } from "../src/render/renderDeck";

describe("Scenes defaults", () => {
  test("DEFAULT_SCENES has 4 entries", () => {
    expect(DEFAULT_SCENES.length).toBe(4);
  });

  test("each default has id/label/content", () => {
    for (const s of DEFAULT_SCENES) {
      expect(typeof s.id).toBe("string");
      expect(s.id.length).toBeGreaterThan(0);
      expect(typeof s.label).toBe("string");
      expect(s.label.length).toBeGreaterThan(0);
      expect(typeof s.content).toBe("string");
    }
  });

  test("blackout default has empty content", () => {
    const blackout = DEFAULT_SCENES.find((s) => s.id === "blackout");
    expect(blackout).toBeDefined();
    expect(blackout?.content).toBe("");
  });

  test("DEFAULT_SETTINGS.scenes is a copy (mutation doesn't leak)", () => {
    DEFAULT_SETTINGS.scenes[0].label = "Mutated";
    const blackout = DEFAULT_SCENES.find((s) => s.id === "blackout");
    expect(blackout?.label).toBe("Blackout");
    // Restore for any subsequent test runs in the same process.
    DEFAULT_SETTINGS.scenes[0].label = "Blackout";
  });

  test("scene ids are unique", () => {
    const ids = DEFAULT_SCENES.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("Iframe bridge wires scene commands", () => {
  test("iframe srcdoc handles setScene + clearScene + toggleMenu", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain("case 'setScene'");
    expect(html).toContain("case 'clearScene'");
    expect(html).toContain("case 'toggleMenu'");
    // The unified scene overlay element id.
    expect(html).toContain("'slides-ng-scene'");
  });

  test("state event includes activeSceneId", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain("activeSceneId");
  });

  test("overview-mode CSS is present (grid layout + slide-number badges)", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain(".reveal.overview .slides");
    expect(html).toContain("counter-increment: slides-ng-tile");
  });

  test("backwards-compat: toggleBlackout still aliases to the scene system", () => {
    const md = "---\n---\n\n# Slide\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain("case 'toggleBlackout'");
    expect(html).toContain("'blackout'");
  });
});
