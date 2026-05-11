import type { Options } from "@wdio/types";
import path from "path";

// The project folder IS the dev vault (vault-as-dev-environment pattern).
// wdio-obsidian-service picks up the plugin from .obsidian/plugins/slides-ng/.
export const config: Options.Testrunner = {
  specs: ["./test/e2e/**/*.spec.ts"],
  maxInstances: 1,

  capabilities: [
    {
      browserName: "obsidian",
      "wdio:obsidianOptions": {
        vault: path.resolve("."),
        plugins: ["."],
      },
    },
  ],

  services: ["obsidian"],
  reporters: ["obsidian"],
  framework: "mocha",

  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  // Build the plugin before tests so .obsidian/plugins/slides-ng/main.js exists.
  onPrepare: async function () {
    const { execSync } = await import("child_process");
    console.log("Building plugin...");
    execSync("bun run build", { stdio: "inherit" });
    // Also sync into the dev vault location, where wdio-obsidian-service expects it.
    execSync(
      "cp main.js styles.css manifest.json .obsidian/plugins/slides-ng/",
      { stdio: "inherit" }
    );
  },

  // Capture a screenshot on failure for debugging.
  afterTest: async function (_test: unknown, _context: unknown, result: { error?: Error }) {
    if (result.error) {
      await browser.saveScreenshot(`./test-results/screenshot-${Date.now()}.png`);
    }
  },
};
