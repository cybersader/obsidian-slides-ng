/**
 * backgroundImage.test.ts — v0.6.0 unit tests for vault-relative path
 * resolution on `data-background-image` / `data-background-video` slide
 * annotations.
 *
 * Tests via the public `renderDeck` API: pass a slide with the
 * annotation + a mock `resolveImage` callback, then assert the output
 * HTML carries the resolved path in the section attrs.
 */

import { test, expect, describe } from "bun:test";
import { renderDeck } from "../src/render/renderDeck";

function mockResolver(path: string): string | null {
  // Simulate Obsidian's adapter: vault-relative paths get an `app://`
  // prefix; unknown paths return null.
  if (path.startsWith("attachments/")) return `app://${path}`;
  return null;
}

describe("Per-slide background attribute path resolution (v0.6.0)", () => {
  test("vault-relative data-background-image resolves via callback", () => {
    const md = "---\n---\n\n# Slide\n\n<!-- slide data-background-image=\"attachments/bg.png\" -->\n";
    const html = renderDeck(md, "deck.md", { resolveImage: mockResolver });
    expect(html).toContain('data-background-image="app://attachments/bg.png"');
    expect(html).not.toContain('data-background-image="attachments/bg.png"');
  });

  test("vault-relative data-background-video resolves via callback", () => {
    const md = "---\n---\n\n# Slide\n\n<!-- slide data-background-video=\"attachments/bg.mp4\" -->\n";
    const html = renderDeck(md, "deck.md", { resolveImage: mockResolver });
    expect(html).toContain('data-background-video="app://attachments/bg.mp4"');
  });

  test("https:// URLs pass through unchanged", () => {
    const md = "---\n---\n\n# Slide\n\n<!-- slide data-background-image=\"https://example.com/bg.png\" -->\n";
    const html = renderDeck(md, "deck.md", { resolveImage: mockResolver });
    expect(html).toContain('data-background-image="https://example.com/bg.png"');
  });

  test("data: URIs pass through unchanged", () => {
    const md =
      "---\n---\n\n# Slide\n\n<!-- slide data-background-image=\"data:image/png;base64,AAAA\" -->\n";
    const html = renderDeck(md, "deck.md", { resolveImage: mockResolver });
    expect(html).toContain('data-background-image="data:image/png;base64,AAAA"');
  });

  test("absolute (`/`-rooted) paths pass through unchanged", () => {
    const md = "---\n---\n\n# Slide\n\n<!-- slide data-background-image=\"/abs/bg.png\" -->\n";
    const html = renderDeck(md, "deck.md", { resolveImage: mockResolver });
    expect(html).toContain('data-background-image="/abs/bg.png"');
  });

  test("when resolver returns null, raw path stays (graceful fallback)", () => {
    const md = "---\n---\n\n# Slide\n\n<!-- slide data-background-image=\"missing/bg.png\" -->\n";
    const html = renderDeck(md, "deck.md", { resolveImage: () => null });
    expect(html).toContain('data-background-image="missing/bg.png"');
  });

  test("no resolver supplied → raw path stays as-is", () => {
    const md = "---\n---\n\n# Slide\n\n<!-- slide data-background-image=\"attachments/bg.png\" -->\n";
    const html = renderDeck(md, "deck.md", {});
    expect(html).toContain('data-background-image="attachments/bg.png"');
  });

  test("other slide attrs (data-auto-animate, class) are untouched by the resolver pass", () => {
    const md =
      '---\n---\n\n# Slide\n\n<!-- slide data-auto-animate class="hero" data-background-image="attachments/bg.png" -->\n';
    const html = renderDeck(md, "deck.md", { resolveImage: mockResolver });
    expect(html).toContain("data-auto-animate");
    expect(html).toContain('class="hero"');
    expect(html).toContain('data-background-image="app://attachments/bg.png"');
  });
});
