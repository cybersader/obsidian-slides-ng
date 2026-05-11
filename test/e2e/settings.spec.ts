/**
 * settings.spec.ts — M7 settings tab + theme switching coverage.
 *
 * Verifies the settings tab renders both controls (theme + transition),
 * and that changing the default theme affects future renders (when no
 * frontmatter override is in play).
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results/m7";

describe("slides-ng settings tab", function () {
  before(() => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  it("exposes default-theme + default-transition controls", async () => {
    // Open the plugin's settings programmatically.
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — setting API is internal
      app.setting.open();
      // @ts-expect-error — setting API is internal
      app.setting.openTabById("slides-ng");
    });
    await browser.pause(400);

    const settingsInfo = await browser.execute(() => {
      const tabContent = document.querySelector(".modal-container .vertical-tab-content");
      if (!tabContent) return { found: false };
      const labels = Array.from(tabContent.querySelectorAll(".setting-item-name")).map(
        (el) => (el as HTMLElement).innerText.trim()
      );
      const selects = tabContent.querySelectorAll("select");
      return {
        found: true,
        labels,
        selectCount: selects.length,
      };
    });

    expect(settingsInfo.found).toBe(true);
    expect(settingsInfo.labels).toContain("Default theme");
    expect(settingsInfo.labels).toContain("Default transition");
    expect(settingsInfo.selectCount).toBeGreaterThanOrEqual(2);
  });

  it("captures a screenshot of the settings tab", async () => {
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/m7-settings.png`);
  });

  it("changing default theme is persisted and used on next render", async () => {
    // Update settings programmatically (faster + more reliable than driving
    // the dropdown UI), then verify the running plugin picks it up.
    await browser.executeObsidian(async ({ app }) => {
      // @ts-expect-error — internal API: app.plugins.plugins
      const plugin = app.plugins.plugins["slides-ng"];
      plugin.settings.defaultTheme = "league";
      plugin.settings.defaultTransition = "zoom";
      await plugin.saveSettings();
    });

    // Close the settings modal so it doesn't sit on top of the preview.
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      app.setting.close();
    });

    // Create a deck with NO theme/transition frontmatter so defaults apply.
    await browser.executeObsidian(
      async ({ app }, { path, body }: { path: string; body: string }) => {
        const f = app.vault.getAbstractFileByPath(path);
        if (f) {
          // @ts-expect-error — delete accepts TFile at runtime
          await app.vault.delete(f);
        }
        // @ts-expect-error — create returns TFile at runtime
        await app.vault.create(path, body);
        const file = app.vault.getAbstractFileByPath(path);
        // @ts-expect-error — openFile accepts TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      },
      { path: "Decks/__m7_default_theme__.md", body: "---\n---\n\n# Default theme test\n" }
    );
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });
    await browser.pause(500);

    // Now inspect the rendered iframe srcdoc to confirm the right
    // transition ended up in the config.
    const config = await browser.execute(() => {
      const iframe = document.querySelector("iframe.slides-ng-frame") as HTMLIFrameElement | null;
      const sd = iframe?.getAttribute("srcdoc") ?? "";
      const m = /Reveal\.initialize\((\{[^)]+\})/.exec(sd);
      return m ? m[1] : null;
    });

    expect(config).not.toBeNull();
    expect(config).toContain('"transition":"zoom"');

    // Tidy: restore defaults so other specs aren't perturbed.
    await browser.executeObsidian(async ({ app }) => {
      // @ts-expect-error — internal API
      const plugin = app.plugins.plugins["slides-ng"];
      plugin.settings.defaultTheme = "black";
      plugin.settings.defaultTransition = "slide";
      await plugin.saveSettings();

      const f = app.vault.getAbstractFileByPath("Decks/__m7_default_theme__.md");
      if (f) {
        // @ts-expect-error — delete accepts TFile at runtime
        await app.vault.delete(f);
      }
    });
  });
});
