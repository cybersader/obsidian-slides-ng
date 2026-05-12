/**
 * authoring-polish.spec.ts — v0.6.0 integration test for the authoring
 * polish bundle: customCSS injection, code-block max-height CSS, and
 * per-slide data-background-image path resolution.
 *
 * Each feature has a focused srcdoc-level assertion — we don't race
 * reveal.js's async render here; we trust unit tests for that and use
 * E2E only to confirm the iframe srcdoc carries the right content.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results";
const PREVIEW_VIEW_TYPE = "slides-ng-preview";

async function openDeckAndPreview(path: string): Promise<void> {
  // Detach any existing preview leaves so the fresh state reflects
  // the deck we're about to open (avoids stale filePath from a
  // previous test).
  await browser.executeObsidian(({ app }) => {
    const leaves = app.workspace.getLeavesOfType("slides-ng-preview");
    for (const leaf of leaves) leaf.detach();
  });
  // Open the file AND run the preview command in the same execution
  // context. Two separate executeObsidian calls leave a gap where the
  // active leaf can drift, which broke the previous version of this
  // helper.
  await browser.executeObsidian(
    async ({ app }, p: string) => {
      const file = app.vault.getAbstractFileByPath(p);
      if (!file) return;
      // @ts-expect-error — openFile accepts TFile at runtime
      await app.workspace.getLeaf(false).openFile(file);
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    },
    path
  );
  await browser.waitUntil(
    async () =>
      (await browser.executeObsidian(
        ({ app }, t: string) => app.workspace.getLeavesOfType(t).length,
        PREVIEW_VIEW_TYPE
      )) > 0,
    { timeout: 10000, timeoutMsg: `preview leaf never opened for ${path}` }
  );
  // Give the iframe time to swap srcdoc + reveal to attach.
  await browser.pause(500);
}

async function getIframeSrcdoc(): Promise<string> {
  return await browser.execute(() => {
    const iframe = document.querySelector("iframe.slides-ng-frame") as HTMLIFrameElement | null;
    return iframe?.srcdoc ?? "";
  });
}

describe("Authoring polish (v0.6.0)", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  it("customCSS frontmatter is injected as the last <style> block in the iframe", async () => {
    await openDeckAndPreview("Decks/fixtures/17-custom-css.md");
    await switchToSlideFrame();
    try {
      await waitForSlides(2, 8000);
    } finally {
      await switchToTop();
    }
    const html = await getIframeSrcdoc();
    expect(html).toContain("customCSS from deck headmatter");
    expect(html).toContain(".slides-ng-custom-css-marker");
    expect(html).toContain(".reveal h1 { color: hotpink");
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/v060-custom-css.png`);
  });

  it("data-background-image vault-relative paths get resolved (or pass through when missing)", async () => {
    await openDeckAndPreview("Decks/fixtures/16-slide-backgrounds.md");
    const html = await getIframeSrcdoc();
    // External URL passes through unchanged.
    expect(html).toContain('data-background-image="https://picsum.photos/1280/720"');
    // Vault-relative path: if the file exists, it gets rewritten to
    // app:// (Obsidian's adapter URL); if not, the resolver returns
    // null and the raw path stays. EITHER outcome is acceptable — we
    // just assert the data-background-image attribute exists and the
    // section carries it.
    expect(html).toMatch(/data-background-image="(app:\/\/|attachments\/)/);
  });

  it("code-block max-height CSS is interpolated into iframe srcdoc", async () => {
    await openDeckAndPreview("Decks/example.md");
    const html = await getIframeSrcdoc();
    // Default codeBlockMaxHeight is "60vh"; setting threading produces
    // a CSS rule with that value.
    expect(html).toMatch(/max-height: \d+(\.\d+)?(vh|px|rem|em)/);
    expect(html).toContain(".reveal .shiki,");
  });

  it("magic-move duration is interpolated into iframe bootstrap as a literal", async () => {
    await openDeckAndPreview("Decks/example.md");
    const html = await getIframeSrcdoc();
    // Default is 500ms; the bootstrap defines SLIDES_NG_MM_DURATION = 500.
    expect(html).toMatch(/SLIDES_NG_MM_DURATION = \d+/);
  });
});
