/**
 * in-window-controls.spec.ts — v0.5.2 visual + integration test.
 *
 * Verifies that the `showRevealControlsEmbedded` and `showRevealMenuEmbedded`
 * settings actually shape the iframe's reveal.js init config. We check the
 * iframe's `srcdoc` attribute directly rather than racing reveal's
 * asynchronous DOM updates — the srcdoc is the source-of-truth for what
 * Reveal will load.
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results";
const PREVIEW_VIEW_TYPE = "slides-ng-preview";

async function getIframeSrcdoc(): Promise<string> {
  return await browser.execute(() => {
    const iframe = document.querySelector("iframe.slides-ng-frame") as HTMLIFrameElement | null;
    return iframe?.srcdoc ?? "";
  });
}

async function setSettingAndReload(
  key: "showRevealControlsEmbedded" | "showRevealMenuEmbedded",
  value: boolean
): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, { k, v }: { k: string; v: boolean }) => {
      // @ts-expect-error — internal API access for testing
      const plugin = app.plugins.plugins["slides-ng"];
      // @ts-expect-error
      plugin.settings[k] = v;
      // @ts-expect-error
      await plugin.saveSettings();
    },
    { k: key, v: value }
  );
  // Trigger a refresh by re-invoking setState on the preview leaf.
  await browser.executeObsidian(({ app }) => {
    const leaves = app.workspace.getLeavesOfType("slides-ng-preview");
    for (const leaf of leaves) {
      // @ts-expect-error — view exposes setState at runtime
      const cur = leaf.view?.getState?.() ?? {};
      // @ts-expect-error
      leaf.view?.setState?.(cur, {});
    }
  });
  // Give the renderer time to swap the iframe's srcdoc.
  await browser.pause(300);
}

describe("In-window reveal.js controls + menu plugin (srcdoc-level)", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/example.md");
      if (file) {
        // @ts-expect-error — openFile accepts TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    });
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });
    await browser.waitUntil(
      async () =>
        (await browser.executeObsidian(
          ({ app }, t: string) => app.workspace.getLeavesOfType(t).length,
          PREVIEW_VIEW_TYPE
        )) > 0,
      { timeout: 10000, timeoutMsg: "preview leaf never opened" }
    );
    await switchToSlideFrame();
    try {
      await waitForSlides(2, 8000);
    } finally {
      await switchToTop();
    }
  });

  it("showRevealControlsEmbedded=false (default) → controls:false in iframe srcdoc", async () => {
    await setSettingAndReload("showRevealControlsEmbedded", false);
    const html = await getIframeSrcdoc();
    expect(html).toContain('"controls":false');
    expect(html).toContain('"progress":false');
  });

  it("showRevealControlsEmbedded=true → controls:true in iframe srcdoc + visible after re-render", async () => {
    await setSettingAndReload("showRevealControlsEmbedded", true);
    const html = await getIframeSrcdoc();
    expect(html).toContain('"controls":true');
    expect(html).toContain('"progress":true');

    // Visual check: wait for reveal to attach + .controls to be present and
    // not aria-hidden. Use a generous timeout because Reveal init is async.
    await switchToSlideFrame();
    try {
      await browser.waitUntil(
        async () => {
          const visible = await browser.execute(() => {
            const c = document.querySelector(".reveal .controls") as HTMLElement | null;
            if (!c) return false;
            // controls element exists; not aria-hidden + has visible CSS.
            const style = window.getComputedStyle(c);
            return c.getAttribute("aria-hidden") !== "true" && style.display !== "none";
          });
          return visible;
        },
        { timeout: 8000, timeoutMsg: "reveal controls never became visible after toggle" }
      );
    } finally {
      await switchToTop();
    }
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/in-window-controls-on.png`);

    // Restore default.
    await setSettingAndReload("showRevealControlsEmbedded", false);
  });

  it("showRevealMenuEmbedded=true → menu plugin script bundled in iframe srcdoc", async () => {
    await setSettingAndReload("showRevealMenuEmbedded", true);
    const html = await getIframeSrcdoc();
    // The reveal-menu UMD wrapper defines window.RevealMenu globally — the
    // bundle string contains the global name as a marker.
    expect(html).toContain("RevealMenu");
    // And the menu CSS gets a hamburger character via ::before.
    expect(html).toContain("slide-menu-button");
  });

  it("showRevealMenuEmbedded=false → menu plugin NOT bundled in srcdoc", async () => {
    await setSettingAndReload("showRevealMenuEmbedded", false);
    const html = await getIframeSrcdoc();
    expect(html).not.toContain("RevealMenu");
    // Restore default.
    await setSettingAndReload("showRevealMenuEmbedded", true);
  });
});
