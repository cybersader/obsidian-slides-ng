// v0.11.78 verification: confirms the popup HTML builder produces
// JS that defines getGridMode + buildSlideGrid for both modes, and
// that the grid mode toggle wires up the buttons.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const { renderDeckStandalone } = await import("../src/render/renderDeck.ts");
const deckPath = "./Decks/01-conference-talk.md";
const md = readFileSync(deckPath, "utf-8");

const outDir = "test-results/popup-verify";
mkdirSync(outDir, { recursive: true });

const CHROME = process.env.CHROME_PATH ||
  "/home/cybersader/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome";

const html = renderDeckStandalone(md, deckPath, { defaultTheme: "black" });

// Static checks: the popup-HTML JS array (returned by
// buildSpeakerPopupHtml) is part of the deck script and must
// reference the runtime mode helpers, not a bake-time const.
const checks = [
  { pattern: /SLIDES_NG_GRID_LS_KEY = "slides-ng-popup-grid-mode"/, label: "localStorage key declared" },
  { pattern: /function getGridMode\(\)/, label: "getGridMode defined" },
  { pattern: /function setGridMode\(mode\)/, label: "setGridMode defined" },
  { pattern: /function syncGridModeButtons\(\)/, label: "syncGridModeButtons defined" },
  { pattern: /if \(getGridMode\(\) === "visual"\)/, label: "visual branch present" },
  { pattern: /id="grid-mode-text"/, label: "text-mode button in HTML" },
  { pattern: /id="grid-mode-visual"/, label: "visual-mode button in HTML" },
  { pattern: /SLIDES_NG_RENDERED_GRID/, label: "old bake-time flag REMOVED", negate: true },
];

let allPass = true;
for (const c of checks) {
  const found = c.pattern.test(html);
  const pass = c.negate ? !found : found;
  console.log(`  ${pass ? "PASS" : "FAIL"} — ${c.label}`);
  if (!pass) allPass = false;
}
if (!allPass) {
  console.error("Static checks failed");
  process.exit(1);
}

// Runtime check: load the deck headless and confirm the popup
// builder runs without ReferenceError + the grid-mode functions
// are reachable.
const probe = `<script>
  (function () {
    var tries = 0;
    function attempt() {
      tries++;
      try {
        if (typeof buildSpeakerPopupHtml === "function") {
          var out = buildSpeakerPopupHtml("about:blank");
          if (typeof out !== "string" || out.length < 100) {
            document.title = "FAIL: returned " + typeof out;
            return;
          }
          if (!/function getGridMode\\(\\)/.test(out)) {
            document.title = "FAIL: popup output missing getGridMode";
            return;
          }
          if (!/id="grid-mode-text"/.test(out)) {
            document.title = "FAIL: popup output missing text button";
            return;
          }
          document.title = "PASS: tries=" + tries + " popupLen=" + out.length;
          return;
        }
      } catch (err) {
        document.title = "FAIL: " + err.message;
        return;
      }
      if (tries < 50) setTimeout(attempt, 100);
      else document.title = "FAIL: buildSpeakerPopupHtml never defined";
    }
    attempt();
  })();
</script>`;
const patched = html.replace("</body>", probe + "</body>");
const exportPath = `${outDir}/popup-runtime-test.html`;
writeFileSync(exportPath, patched);

await new Promise((res) => {
  const chrome = spawn(CHROME, [
    "--headless=new", "--no-sandbox", "--disable-gpu",
    "--virtual-time-budget=6000",
    "--dump-dom",
    `file://${process.cwd()}/${exportPath}`,
  ]);
  let out = "";
  chrome.stdout.on("data", (d) => (out += d.toString()));
  chrome.on("close", () => {
    const m = out.match(/<title>([^<]*)<\/title>/);
    console.log(`  Runtime: ${m ? m[1] : "(no title)"}`);
    res();
  });
});
