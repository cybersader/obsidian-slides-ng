/**
 * smoke.spec.ts — slides-ng plugin baseline E2E.
 *
 * If this fails, every other E2E spec will too — start debugging here.
 * Verifies: Obsidian launches, plugin loads in the (sandboxed) vault,
 * and the open-preview command is registered.
 *
 * Mirrors the pattern from crosswalker/tests/e2e/smoke.spec.ts.
 *
 * Run: `bun run e2e`
 */

import { browser } from "@wdio/globals";
import { expect } from "expect";

describe("slides-ng plugin — smoke", function () {
  it("Obsidian launches with the vault loaded", async () => {
    const info = await browser.executeObsidian(({ app }) => ({
      hasApp: !!app,
      vaultName: app.vault.getName(),
    }));

    expect(info.hasApp).toBe(true);
    // wdio-obsidian-service sandboxes by copying the vault to a randomized
    // sibling directory; match by prefix.
    expect(info.vaultName).toMatch(/^e2e-vault/);
  });

  it("slides-ng plugin is loaded", async () => {
    const info = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — plugins.plugins is internal API; documented in obsidian-typings
      const plugin = app.plugins.plugins["slides-ng"];
      return {
        loaded: !!plugin,
        manifestId: plugin?.manifest?.id,
        manifestName: plugin?.manifest?.name,
      };
    });

    expect(info.loaded).toBe(true);
    expect(info.manifestId).toBe("slides-ng");
    expect(info.manifestName).toBe("Slides NG");
  });

  it("open-preview command is registered", async () => {
    const info = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — commands.findCommand is internal API
      const cmd = app.commands.findCommand("slides-ng:open-preview");
      return { found: !!cmd, name: cmd?.name };
    });

    expect(info.found).toBe(true);
    expect(info.name).toMatch(/open preview/i);
  });
});
