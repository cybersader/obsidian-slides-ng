import type { Options } from "@wdio/types";
import path from "path";

/**
 * WebdriverIO + wdio-obsidian-service config.
 *
 * Drives real Obsidian against `e2e-vault/` (a tiny dedicated vault — NOT
 * the project root used for day-to-day dev). wdio-obsidian-service sandboxes
 * each run by *copying the entire vault* to a randomized sibling directory;
 * pointing at the project root means copying 1+ GB of node_modules and
 * .obsidian-cache on every run (5+ min on WSL2's /mnt/c mount), so we use
 * a minimal e2e-vault/ instead. Spec discovery: `test/e2e/**\/*.spec.ts`.
 *
 * Workflow:
 *   1. `onPrepare` builds the plugin and syncs main.js+styles.css+manifest.json
 *      into `e2e-vault/.obsidian/plugins/slides-ng/` so Obsidian sees it on
 *      launch.
 *   2. wdio-obsidian-service downloads (or reuses) Obsidian into
 *      `.obsidian-cache/`. browserVersion='latest' gets the newest Obsidian
 *      app; installerVersion='earliest' uses the oldest installer matching
 *      manifest.json's minAppVersion (avoids Electron-on-WSL2 issues with
 *      newer installers).
 *   3. Each spec opens Obsidian against the sandboxed copy of e2e-vault/.
 *
 * Pattern source: workspace's `crosswalker-obsidian-plugin/wdio.conf.mts`.
 */
export const config: Options.Testrunner = {
  runner: "local",
  framework: "mocha",

  specs: ["./test/e2e/**/*.spec.ts"],

  // One Obsidian instance at a time keeps the dev vault deterministic.
  maxInstances: 1,

  capabilities: [
    {
      browserName: "obsidian",
      browserVersion: "latest",
      "wdio:obsidianOptions": {
        installerVersion: "earliest", // matches manifest.json minAppVersion
        vault: path.resolve("./e2e-vault"),
        plugins: ["."],
      },
    },
  ],

  services: ["obsidian"],
  reporters: ["obsidian"],

  cacheDir: path.resolve(".obsidian-cache"),

  mochaOpts: {
    ui: "bdd",
    timeout: 180000, // 180 s — first-launch Obsidian boot can be slow on WSL2
  },

  logLevel: "warn",

  // Build the plugin before tests, then sync into the e2e-vault.
  onPrepare: async function () {
    const { execSync } = await import("child_process");
    console.log("Building plugin into e2e-vault...");
    execSync("bun run build", { stdio: "inherit" });
    execSync(
      "cp main.js styles.css manifest.json e2e-vault/.obsidian/plugins/slides-ng/",
      { stdio: "inherit" }
    );
  },

  // Capture a screenshot on failure for debugging.
  afterTest: async function (_test: unknown, _context: unknown, result: { error?: Error }) {
    if (result.error) {
      await browser.saveScreenshot(`./test-results/failure-${Date.now()}.png`);
    }
  },
};
