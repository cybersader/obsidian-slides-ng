/**
 * M1.5 smoke spec — proves the plugin loads inside a real Obsidian instance,
 * the command registers, and the preview view opens without throwing.
 *
 * Renderer assertions (iframe content, slide count) wait for M2 — by then
 * test/e2e/helpers/iframe.ts will be in active use.
 */

declare const browser: WebdriverIO.Browser;

interface ObsidianApp {
  workspace: {
    layoutReady: boolean;
    getLeavesOfType: (type: string) => unknown[];
  };
  plugins: {
    plugins: Record<string, unknown>;
  };
  commands: {
    commands: Record<string, unknown>;
    executeCommandById: (id: string) => Promise<unknown> | unknown;
  };
}

declare global {
  interface Window {
    app: ObsidianApp;
  }
}

describe("slides-ng smoke", () => {
  before(async () => {
    await browser.waitUntil(
      async () => {
        const ready = await browser.execute(() => window.app?.workspace?.layoutReady === true);
        return ready === true;
      },
      { timeout: 30000, timeoutMsg: "Obsidian workspace did not become ready" }
    );

    await browser.waitUntil(
      async () => {
        const loaded = await browser.execute(
          () => !!window.app?.plugins?.plugins?.["slides-ng"]
        );
        return loaded === true;
      },
      { timeout: 15000, timeoutMsg: "slides-ng plugin did not load" }
    );
  });

  it("plugin is loaded", async () => {
    const loaded = await browser.execute(
      () => !!window.app.plugins.plugins["slides-ng"]
    );
    expect(loaded).toBe(true);
  });

  it("registers the open-preview command", async () => {
    const commandIds = await browser.execute(() =>
      Object.keys(window.app.commands.commands).filter((id) =>
        id.startsWith("slides-ng:")
      )
    );
    expect(commandIds).toContain("slides-ng:open-preview");
  });

  it("opens the preview view", async () => {
    await browser.execute(() =>
      window.app.commands.executeCommandById("slides-ng:open-preview")
    );

    await browser.waitUntil(
      async () => {
        const count = await browser.execute(
          () => window.app.workspace.getLeavesOfType("slides-ng-preview").length
        );
        return count > 0;
      },
      { timeout: 5000, timeoutMsg: "preview view leaf was not opened" }
    );
  });
});
