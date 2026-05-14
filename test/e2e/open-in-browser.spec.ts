/**
 * open-in-browser.spec.ts — M6 visual + integration test.
 *
 * Runs the slides-ng:open-in-browser command in real Obsidian, then:
 *   - verifies the export file lands in the vault at the expected name
 *   - verifies the file is a self-contained HTML doc with embedded:false
 *   - verifies the toolbar shows both Reload + Open-in-browser buttons
 *   - captures a screenshot of the SlidesNG view with both buttons visible
 *
 * What we explicitly DON'T verify: that electron.shell.openExternal
 * actually launched the user's default browser. That's an Electron IPC
 * boundary we can't observe from WDIO. We trust the API; the plugin code
 * just needs to invoke it correctly.
 */

import { browser, $ } from "@wdio/globals";
import { expect } from "expect";
import { SLIDE_IFRAME_SELECTOR } from "./helpers/iframe";
import { mkdirSync, existsSync } from "node:fs";

const SCREENSHOT_DIR = "./test-results/m6";

describe("slides-ng open-in-browser", function () {
  before(async () => {
    if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // Open the example deck and preview pane.
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath("Decks/example.md");
      if (file) {
        // @ts-expect-error — TFile at runtime
        await app.workspace.getLeaf(false).openFile(file);
      }
    });
    await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — internal API
      app.commands.executeCommandById("slides-ng:open-preview");
    });

    const iframe = await $(SLIDE_IFRAME_SELECTOR);
    await iframe.waitForExist({ timeout: 5000 });
  });

  it("registers the open-in-browser command", async () => {
    const info = await browser.executeObsidian(({ app }) => {
      // @ts-expect-error — findCommand is internal API
      const cmd = app.commands.findCommand("slides-ng:open-in-browser");
      return { found: !!cmd, name: cmd?.name };
    });
    expect(info.found).toBe(true);
    expect(info.name).toMatch(/open in browser/i);
  });

  it("writes a .slides-ng-export-<timestamp>.html file to the vault", async () => {
    const writtenPath = await browser.executeObsidian(async ({ app }) => {
      // Snapshot existing exports first so we can detect the new one.
      // @ts-expect-error — adapter.list is internal API
      const before = (await app.vault.adapter.list("/")).files as string[];
      const beforeSet = new Set(before.filter((p) => p.includes(".slides-ng-export-")));

      // @ts-expect-error — internal API
      await app.commands.executeCommandById("slides-ng:open-in-browser");

      // Poll briefly for the file to appear (write is async).
      let after: string[] = [];
      for (let i = 0; i < 20; i++) {
        // @ts-expect-error — adapter.list is internal API
        after = (await app.vault.adapter.list("/")).files as string[];
        const newFiles = after.filter(
          (p) => p.includes(".slides-ng-export-") && !beforeSet.has(p)
        );
        if (newFiles.length > 0) return newFiles[0];
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return null;
    });

    expect(writtenPath).not.toBeNull();
    expect(writtenPath).toMatch(/^\.slides-ng-export-\d+\.html$/);
  });

  it("the exported HTML is self-contained and uses embedded:false", async () => {
    const result = await browser.executeObsidian(async ({ app }) => {
      // @ts-expect-error — adapter.list is internal API
      const all = (await app.vault.adapter.list("/")).files as string[];
      const exports = all.filter((p) => p.includes(".slides-ng-export-"));
      if (exports.length === 0) return null;
      // Most recent first.
      exports.sort();
      const latest = exports[exports.length - 1];
      // @ts-expect-error — adapter.read is internal API
      const content = (await app.vault.adapter.read(latest)) as string;
      return {
        path: latest,
        length: content.length,
        hasDoctype: content.startsWith("<!doctype html>"),
        hasEmbeddedFalse: content.includes('"embedded":false'),
        hasControlsTrue: content.includes('"controls":true'),
        // URL-form checks only — slide content can legitimately mention
        // the word "localhost" in prose (e.g. example.md has "No localhost.").
        hasNetworkRefs:
          /https?:\/\/(?:cdn\.|unpkg|jsdelivr|localhost|127\.0\.0\.1)/i.test(content),
        hasReveal: content.includes('class="reveal"'),
      };
    });

    expect(result).not.toBeNull();
    // The export is the full inlined deck — ≥100 KB.
    expect(result!.length).toBeGreaterThan(100_000);
    expect(result!.hasDoctype).toBe(true);
    expect(result!.hasEmbeddedFalse).toBe(true);
    expect(result!.hasControlsTrue).toBe(true);
    expect(result!.hasReveal).toBe(true);
    expect(result!.hasNetworkRefs).toBe(false);
  });

  it("toolbar shows both Reload + Open-in-browser buttons", async () => {
    // Use textContent rather than innerText: when the leaf is narrow,
    // a container query hides the label visually (`display: none`) which
    // makes innerText return ''. textContent still reflects the DOM text.
    const buttonTexts = await browser.execute(() => {
      const btns = Array.from(
        document.querySelectorAll(".slides-ng-toolbar .slides-ng-toolbar-btn")
      ) as HTMLButtonElement[];
      return btns.map((b) => (b.textContent ?? "").trim());
    });
    expect(buttonTexts).toContain("Reload");
    expect(buttonTexts).toContain("Open in browser");
  });

  it("captures a screenshot of the M6 toolbar + exported deck", async () => {
    await browser.saveScreenshot(`${SCREENSHOT_DIR}/m6-frame.png`);
  });

  // v0.11.32: end-to-end hamburger menu test. Reads the latest
  // export, injects it into a hidden iframe inside the WDIO browser
  // session, waits for reveal + menu plugin to boot, clicks the
  // hamburger, asserts the drawer opens. This is the "does the menu
  // actually work when someone opens the export in a real browser"
  // assertion. (We can't observe the OS shell launch from CDP, but
  // the iframe runs the SAME exported HTML through the SAME script
  // execution path — if it works here, it works there.)
  describe("hamburger menu in the exported HTML", function () {
    it("the menu opens when the hamburger button is clicked", async () => {
      // Get the latest export's content from the vault.
      const exportContent = await browser.executeObsidian(async ({ app }) => {
        // @ts-expect-error — adapter.list is internal API
        const all = (await app.vault.adapter.list("/")).files as string[];
        const exports = all.filter((p) => p.includes(".slides-ng-export-"));
        if (exports.length === 0) return null;
        exports.sort();
        const latest = exports[exports.length - 1];
        // @ts-expect-error — adapter.read is internal API
        return (await app.vault.adapter.read(latest)) as string;
      });
      expect(exportContent).not.toBeNull();
      // Inject the exported HTML into a fresh iframe and wait for
      // reveal + the menu plugin to finish booting. We use srcdoc so
      // we don't need a server. Sandbox is intentionally omitted so
      // the menu plugin's UMD attaches to its iframe window without
      // CORS/sandbox-script restrictions.
      //
      // Tack on a small <script> at the END of the body that
      // captures uncaught errors during reveal-menu init and exposes
      // them on window for the test to inspect.
      await browser.execute((html: string) => {
        const existing = document.getElementById("slides-ng-hamburger-probe");
        if (existing) existing.remove();
        const errorCapture = `<script>
          window.__slidesNgErrors = [];
          window.addEventListener('error', function (e) {
            window.__slidesNgErrors.push({
              msg: e.message,
              src: e.filename,
              line: e.lineno,
              stack: e.error && e.error.stack ? String(e.error.stack) : null,
            });
          });
          window.addEventListener('unhandledrejection', function (e) {
            window.__slidesNgErrors.push({
              msg: 'unhandled-rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)),
              stack: e.reason && e.reason.stack ? String(e.reason.stack) : null,
            });
          });
        </script>`;
        const augmented = html.replace("</body>", errorCapture + "</body>");
        const iframe = document.createElement("iframe");
        iframe.id = "slides-ng-hamburger-probe";
        iframe.style.cssText =
          "position:fixed;bottom:0;right:0;width:800px;height:600px;" +
          "border:1px solid #888;z-index:9999;";
        iframe.srcdoc = augmented;
        document.body.appendChild(iframe);
      }, exportContent);
      // Wait for the menu plugin to be ready inside the iframe.
      const probeIframe = await $("#slides-ng-hamburger-probe");
      await probeIframe.waitForExist({ timeout: 8000 });
      // Reveal init is async — poll for .slide-menu-button to exist
      // (the menu plugin appends it after Reveal.initialize fires).
      let menuReady = false;
      for (let i = 0; i < 40; i++) {
        await browser.switchFrame(probeIframe);
        try {
          menuReady = await browser.execute(() => {
            return !!document.querySelector(".slide-menu-button");
          });
        } finally {
          await browser.switchFrame(null);
        }
        if (menuReady) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!menuReady) {
        // Diagnostic: dump what IS in the iframe so we can see why
        // the menu plugin didn't render a button.
        await browser.switchFrame(probeIframe);
        let diag: {
          hasReveal: boolean;
          hasRevealMenu: boolean;
          revealReady: boolean;
          allButtons: string[];
          plugins: string[];
        } = {
          hasReveal: false,
          hasRevealMenu: false,
          revealReady: false,
          allButtons: [],
          plugins: [],
        };
        try {
          diag = await browser.execute(() => {
            const w = window as unknown as {
              Reveal?: {
                isReady?: () => boolean;
                getPlugins?: () => Record<string, unknown>;
                getConfig?: () => Record<string, unknown>;
                getPlugin?: (id: string) => unknown;
              };
              RevealMenu?: unknown;
              __slidesNgErrors?: unknown[];
            };
            const plugins =
              w.Reveal && typeof w.Reveal.getPlugins === "function"
                ? Object.keys(w.Reveal.getPlugins())
                : [];
            const btns = Array.from(
              document.querySelectorAll<HTMLElement>("button")
            ).map((b) => b.className || b.id || "(no class/id)");
            const menuCfg =
              w.Reveal && typeof w.Reveal.getConfig === "function"
                ? w.Reveal.getConfig().menu
                : null;
            const slideMenuEl = !!document.querySelector(".slide-menu");
            const slideMenuWrapper = !!document.querySelector(
              ".slide-menu-wrapper"
            );
            const errors = w.__slidesNgErrors ?? [];
            // The menu plugin's init may need to be called manually
            // if reveal didn't see it as a plugin object.
            const pluginRef =
              w.Reveal && typeof w.Reveal.getPlugin === "function"
                ? w.Reveal.getPlugin("menu")
                : null;
            const pluginShape: Record<string, string> = {};
            if (pluginRef && typeof pluginRef === "object") {
              for (const k of Object.keys(pluginRef)) {
                pluginShape[k] = typeof (pluginRef as Record<string, unknown>)[k];
              }
            }
            return {
              hasReveal: typeof w.Reveal !== "undefined",
              hasRevealMenu: typeof w.RevealMenu !== "undefined",
              revealReady:
                !!w.Reveal &&
                typeof w.Reveal.isReady === "function" &&
                w.Reveal.isReady(),
              allButtons: btns,
              plugins,
              menuCfg,
              slideMenuEl,
              slideMenuWrapper,
              errors,
              pluginShape,
            } as unknown as typeof diag;
          });
        } finally {
          await browser.switchFrame(null);
        }
        // eslint-disable-next-line no-console
        console.log(`[hamburger-diag] ${JSON.stringify(diag, null, 2)}`);
        throw new Error(
          `Hamburger button never appeared. ` +
            `Reveal=${diag.hasReveal} ready=${diag.revealReady} ` +
            `RevealMenu=${diag.hasRevealMenu} ` +
            `plugins=[${diag.plugins.join(",")}] ` +
            `buttons=[${diag.allButtons.join(",")}]`
        );
      }
      // Click the hamburger and verify the drawer opens.
      await browser.switchFrame(probeIframe);
      let drawerOpen = false;
      try {
        await browser.execute(() => {
          const btn = document.querySelector(
            ".slide-menu-button"
          ) as HTMLElement | null;
          btn?.click();
        });
        // Reveal-menu animates in — poll briefly for the open state.
        for (let i = 0; i < 20; i++) {
          drawerOpen = await browser.execute(() => {
            // reveal-menu adds `body.has-menu-open` and `.slide-menu`
            // gains `.active` / `.is-open` depending on the build.
            const menu = document.querySelector(".slide-menu");
            if (!menu) return false;
            const bodyHasClass =
              document.body.classList.contains("has-menu-open");
            const menuHasOpenClass =
              menu.classList.contains("active") ||
              menu.classList.contains("is-open") ||
              menu.classList.contains("open");
            // Some menu builds toggle data attribute instead.
            const dataOpen =
              menu.getAttribute("data-open") === "true";
            return bodyHasClass || menuHasOpenClass || dataOpen;
          });
          if (drawerOpen) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      } finally {
        await browser.switchFrame(null);
      }
      // Screenshot whether or not the assertion passes — useful for
      // visual verification.
      await browser.saveScreenshot(`${SCREENSHOT_DIR}/hamburger-clicked.png`);
      // Clean up the probe iframe so other tests aren't affected.
      await browser.execute(() => {
        const el = document.getElementById("slides-ng-hamburger-probe");
        if (el) el.remove();
      });
      if (!drawerOpen) {
        throw new Error(
          "Hamburger button clicked but the menu drawer didn't open " +
            "(neither body.has-menu-open nor .slide-menu.active|.is-open|.open " +
            "nor [data-open=true] became true within 2 s)."
        );
      }
    });
  });

  // v0.11.32: reveal.js keyboard shortcuts should work in the
  // exported HTML when opened in a real browser. We can't dispatch
  // keys to a separate browser window, but we CAN inject the
  // export into a hidden iframe (same path the hamburger test uses)
  // and dispatch keyboard events INSIDE the iframe. If reveal's
  // keyboard handler is wired correctly, M (open menu), B (blackout),
  // and arrow keys (navigate) should all respond.
  describe("reveal keyboard shortcuts in the exported HTML", function () {
    async function getOrInjectProbe(): Promise<void> {
      const exists = await browser.execute(() => {
        return !!document.getElementById("slides-ng-hamburger-probe");
      });
      if (exists) return;
      const exportContent = await browser.executeObsidian(async ({ app }) => {
        // @ts-expect-error — adapter.list is internal API
        const all = (await app.vault.adapter.list("/")).files as string[];
        const exports = all.filter((p) => p.includes(".slides-ng-export-"));
        if (exports.length === 0) return null;
        exports.sort();
        const latest = exports[exports.length - 1];
        // @ts-expect-error — adapter.read is internal API
        return (await app.vault.adapter.read(latest)) as string;
      });
      await browser.execute((html: string) => {
        const iframe = document.createElement("iframe");
        iframe.id = "slides-ng-hamburger-probe";
        iframe.style.cssText =
          "position:fixed;bottom:0;right:0;width:800px;height:600px;" +
          "border:1px solid #888;z-index:9999;";
        iframe.srcdoc = html;
        document.body.appendChild(iframe);
      }, exportContent);
      const probe = await $("#slides-ng-hamburger-probe");
      await probe.waitForExist({ timeout: 8000 });
      // Wait for reveal to finish init.
      for (let i = 0; i < 40; i++) {
        await browser.switchFrame(probe);
        let ready = false;
        try {
          ready = await browser.execute(() => {
            const w = window as unknown as { Reveal?: { isReady?: () => boolean } };
            return !!w.Reveal && typeof w.Reveal.isReady === "function" && w.Reveal.isReady();
          });
        } finally {
          await browser.switchFrame(null);
        }
        if (ready) break;
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    it("pressing M opens the hamburger menu", async () => {
      await getOrInjectProbe();
      const probe = await $("#slides-ng-hamburger-probe");
      await browser.switchFrame(probe);
      let opened = false;
      try {
        // Reset state — close any previously-open menu.
        await browser.execute(() => {
          const menu = document.querySelector(".slide-menu");
          if (menu && menu.classList.contains("active")) {
            const btn = document.querySelector(
              ".slide-menu-button"
            ) as HTMLElement | null;
            btn?.click();
          }
        });
        await new Promise((r) => setTimeout(r, 300));
        // Dispatch M keydown on the iframe document.
        await browser.execute(() => {
          const ev = new KeyboardEvent("keydown", {
            key: "m",
            code: "KeyM",
            keyCode: 77,
            which: 77,
            bubbles: true,
            cancelable: true,
          });
          document.dispatchEvent(ev);
        });
        for (let i = 0; i < 20; i++) {
          opened = await browser.execute(() => {
            const menu = document.querySelector(".slide-menu");
            if (!menu) return false;
            return (
              menu.classList.contains("active") ||
              menu.classList.contains("is-open") ||
              menu.classList.contains("open")
            );
          });
          if (opened) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      } finally {
        await browser.switchFrame(null);
      }
      if (!opened) {
        throw new Error("M key did not open the reveal menu inside the export.");
      }
    });

    it("right-arrow navigates to the next slide", async () => {
      await getOrInjectProbe();
      const probe = await $("#slides-ng-hamburger-probe");
      await browser.switchFrame(probe);
      let advanced = false;
      try {
        // The previous test (M-key) may have left the menu open,
        // which captures keyboard events. Force-close it so arrow
        // keys reach reveal.
        await browser.execute(() => {
          const w = window as unknown as {
            Reveal?: { getPlugin?: (id: string) => { closeMenu?: () => void } | null };
          };
          const menuPlugin = w.Reveal?.getPlugin?.("menu");
          if (menuPlugin && typeof menuPlugin.closeMenu === "function") {
            menuPlugin.closeMenu();
          }
        });
        await new Promise((r) => setTimeout(r, 200));
        const startIdx = await browser.execute(() => {
          const w = window as unknown as { Reveal?: { getIndices?: () => { h: number } } };
          return w.Reveal?.getIndices?.().h ?? 0;
        });
        // First go back to slide 0 for a deterministic start.
        await browser.execute(() => {
          const w = window as unknown as { Reveal?: { slide?: (h: number) => void } };
          w.Reveal?.slide?.(0);
        });
        await new Promise((r) => setTimeout(r, 200));
        // Press arrow-right.
        await browser.execute(() => {
          const ev = new KeyboardEvent("keydown", {
            key: "ArrowRight",
            code: "ArrowRight",
            keyCode: 39,
            which: 39,
            bubbles: true,
            cancelable: true,
          });
          document.dispatchEvent(ev);
        });
        for (let i = 0; i < 20; i++) {
          const idx = await browser.execute(() => {
            const w = window as unknown as { Reveal?: { getIndices?: () => { h: number } } };
            return w.Reveal?.getIndices?.().h ?? 0;
          });
          if ((idx as number) > 0) {
            advanced = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        // eslint-disable-next-line no-console
        console.log(
          `[reveal-keyboard] startIdx=${startIdx}, advanced=${advanced}`
        );
      } finally {
        await browser.switchFrame(null);
      }
      if (!advanced) {
        throw new Error("ArrowRight key did not advance the slide.");
      }
    });

    it("captures a screenshot of the exported HTML with the probe iframe visible", async () => {
      await getOrInjectProbe();
      await browser.saveScreenshot(
        `${SCREENSHOT_DIR}/exported-html-probe.png`
      );
      // Clean up the probe so it doesn't bleed into other specs.
      await browser.execute(() => {
        const el = document.getElementById("slides-ng-hamburger-probe");
        if (el) el.remove();
      });
    });
  });

  // v0.11.33: Grid button + S-key speaker-view popup in the
  // standalone export. These are the standalone-only enhancements
  // gated behind `embedded === false`. We test both inside the
  // probe iframe we already use for hamburger/keyboard tests.
  describe("standalone-only enhancements", function () {
    async function getOrInjectProbe(): Promise<void> {
      const exists = await browser.execute(() => {
        return !!document.getElementById("slides-ng-hamburger-probe");
      });
      if (exists) return;
      const exportContent = await browser.executeObsidian(async ({ app }) => {
        // @ts-expect-error — adapter.list is internal API
        const all = (await app.vault.adapter.list("/")).files as string[];
        const exports = all.filter((p) => p.includes(".slides-ng-export-"));
        if (exports.length === 0) return null;
        exports.sort();
        const latest = exports[exports.length - 1];
        // @ts-expect-error — adapter.read is internal API
        return (await app.vault.adapter.read(latest)) as string;
      });
      await browser.execute((html: string) => {
        const iframe = document.createElement("iframe");
        iframe.id = "slides-ng-hamburger-probe";
        iframe.style.cssText =
          "position:fixed;bottom:0;right:0;width:800px;height:600px;" +
          "border:1px solid #888;z-index:9999;";
        iframe.srcdoc = html;
        document.body.appendChild(iframe);
      }, exportContent);
      const probe = await $("#slides-ng-hamburger-probe");
      await probe.waitForExist({ timeout: 8000 });
      for (let i = 0; i < 40; i++) {
        await browser.switchFrame(probe);
        let ready = false;
        try {
          ready = await browser.execute(() => {
            const w = window as unknown as { Reveal?: { isReady?: () => boolean } };
            return !!w.Reveal && typeof w.Reveal.isReady === "function" && w.Reveal.isReady();
          });
        } finally {
          await browser.switchFrame(null);
        }
        if (ready) break;
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    it("Grid button is mounted in the corner", async () => {
      await getOrInjectProbe();
      const probe = await $("#slides-ng-hamburger-probe");
      await browser.switchFrame(probe);
      try {
        const buttonInfo = await browser.execute(() => {
          const btn = document.getElementById(
            "slides-ng-grid-btn"
          ) as HTMLElement | null;
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          return {
            present: true,
            // Just sanity-check the visible position is somewhere
            // toward the top-right.
            top: Math.round(r.top),
            right: Math.round(window.innerWidth - r.right),
            width: Math.round(r.width),
            height: Math.round(r.height),
          };
        });
        if (!buttonInfo) {
          throw new Error("Grid button (#slides-ng-grid-btn) not found.");
        }
        if (buttonInfo.top > 50 || buttonInfo.right > 50) {
          throw new Error(
            `Grid button is too far from the top-right corner: ` +
              `${JSON.stringify(buttonInfo)}`
          );
        }
      } finally {
        await browser.switchFrame(null);
      }
    });

    it("clicking the Grid button opens the slides overview", async () => {
      await getOrInjectProbe();
      const probe = await $("#slides-ng-hamburger-probe");
      await browser.switchFrame(probe);
      try {
        // Use the exposed helper for determinism (avoids click-coord
        // math). Verifies the helper is wired correctly + the
        // toggleOverview message handler is reachable.
        await browser.execute(() => {
          const w = window as unknown as { __slidesNgToggleGrid?: () => void };
          w.__slidesNgToggleGrid?.();
        });
        // toggleOverview is async (builds grid + clones sections).
        let overlayPresent = false;
        for (let i = 0; i < 20; i++) {
          overlayPresent = await browser.execute(() => {
            return !!document.getElementById("slides-ng-grid");
          });
          if (overlayPresent) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        if (!overlayPresent) {
          throw new Error(
            "Grid overlay (#slides-ng-grid) didn't appear after clicking the Grid button."
          );
        }
        // Close it so subsequent tests aren't affected.
        await browser.execute(() => {
          const w = window as unknown as { __slidesNgToggleGrid?: () => void };
          w.__slidesNgToggleGrid?.();
        });
      } finally {
        await browser.switchFrame(null);
      }
    });

    it("S-key speaker view popup function is exposed", async () => {
      await getOrInjectProbe();
      const probe = await $("#slides-ng-hamburger-probe");
      await browser.switchFrame(probe);
      try {
        // Verify the helper exists (we can't reliably test
        // window.open from inside a sandboxed iframe — popups are
        // often blocked in test environments).
        const hasHelper = await browser.execute(() => {
          const w = window as unknown as {
            __slidesNgOpenSpeakerView?: () => void;
          };
          return typeof w.__slidesNgOpenSpeakerView === "function";
        });
        if (!hasHelper) {
          throw new Error(
            "window.__slidesNgOpenSpeakerView function not exposed in the export. " +
              "The S-key handler wiring is broken."
          );
        }
        // Stub window.open + call the helper to verify it actually
        // tries to open a popup with the right contents.
        const opened: string | null = await browser.execute(() => {
          const w = window as unknown as {
            __slidesNgOpenSpeakerView?: () => void;
            open?: (
              url: string,
              target?: string,
              features?: string
            ) => Window | null;
          };
          const originalOpen = w.open;
          let writtenHtml: string | null = null;
          w.open = (..._args: unknown[]) => {
            // Return a stub object whose `document.write` captures
            // the popup HTML we'd have rendered.
            const stub: {
              document: {
                open: () => void;
                close: () => void;
                write: (html: string) => void;
              };
              closed: boolean;
              focus: () => void;
            } = {
              document: {
                open: () => {},
                close: () => {},
                write: (html: string) => {
                  writtenHtml = html;
                },
              },
              closed: false,
              focus: () => {},
            };
            return stub as unknown as Window;
          };
          try {
            w.__slidesNgOpenSpeakerView?.();
          } finally {
            w.open = originalOpen;
          }
          return writtenHtml;
        });
        if (!opened) {
          throw new Error("window.open was not called by the S-key helper.");
        }
        // Verify the popup HTML has the expected speaker-view panels.
        if (!opened.includes("Speaker view")) {
          throw new Error("Popup HTML missing 'Speaker view' title.");
        }
        if (!opened.includes("Current slide") || !opened.includes("Next slide")) {
          throw new Error(
            "Popup HTML missing 'Current slide' / 'Next slide' panels."
          );
        }
        if (!opened.includes("Speaker notes") || !opened.includes("Timer")) {
          throw new Error("Popup HTML missing 'Speaker notes' / 'Timer' panels.");
        }
      } finally {
        await browser.switchFrame(null);
      }
    });
  });
});
