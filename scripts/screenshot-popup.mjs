// Render a STANDALONE minimal popup HTML mimicking the layout
// structure (CSS verbatim from src/render/revealTemplate.ts, static
// placeholder content) so I can screenshot it and check for the
// layout overlap issue at multiple sizes.
import { writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const outDir = "test-results/popup-screenshot";
mkdirSync(outDir, { recursive: true });

const CHROME = process.env.CHROME_PATH ||
  "/home/cybersader/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome";

const html = `<!doctype html><html><head>
<meta charset="utf-8">
<title>Slides NG — Speaker view</title>
<style>
html, body { margin: 0; height: 100%; background: #1a1a1a; color: #fff; font-family: sans-serif; overflow: hidden; }
body { display: grid; grid-template-rows: auto minmax(0, 1fr) minmax(0, 1fr) auto; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px; box-sizing: border-box; overflow: hidden; }
.scenes-bar { grid-column: 1 / -1; background: #0a0a0a; border: 1px solid #333; border-radius: 6px; padding: 0.4rem 0.6rem; display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
.scenes-bar .scene-label { font-size: 0.75em; color: #999; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 0.4rem; }
.scene-btn { background: #2a2a2a; color: #e0e0e0; border: 1px solid #444; border-radius: 4px; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.85em; transition: background 80ms ease, border-color 80ms ease; }
.scene-btn:hover { background: #3a3a3a; border-color: #555; }
.scene-btn.active { background: #42affa; color: #fff; border-color: #42affa; }
.scene-btn.clear { margin-left: auto; background: transparent; border-color: #555; }
.panel { background: #0a0a0a; border: 1px solid #333; overflow: hidden; display: flex; flex-direction: column; border-radius: 6px; min-height: 0; min-width: 0; }
.label { font-size: 0.75em; color: #999; padding: 0.3rem 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; flex: 0 0 auto; }
.frame-wrap { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 0.4rem; }
.frame-aspect { aspect-ratio: 960 / 700; background: #000; border: 1px solid #222; max-width: 100%; max-height: 100%; position: relative; display: flex; align-items: center; justify-content: center; color: #555; font-size: 0.85em; }
.notes { padding: 0.6rem 0.8rem; overflow-y: auto; flex: 1 1 auto; font-size: 1em; line-height: 1.5; }
.notes .empty { color: #666; font-style: italic; }
.timer-wrap { display: flex; flex-direction: column; align-items: center; justify-content: space-around; flex: 1 1 auto; gap: 0.2rem; min-height: 0; padding: 0.3rem 0.4rem; }
.timer { font-family: monospace; font-size: clamp(1.6em, 6vh, 3.5em); color: #e0e0e0; line-height: 1; }
.timer-controls { display: flex; gap: 0.4rem; margin-top: 0.5rem; justify-content: center; }
.timer-controls button { background: #222; color: #ccc; border: 1px solid #444; padding: 0.25rem 0.6rem; border-radius: 4px; cursor: pointer; font-size: 0.85em; }
.slide-counter { position: absolute; top: 6px; left: 8px; background: rgba(0,0,0,0.6); padding: 2px 6px; border-radius: 4px; font-size: 0.75em; }
</style></head><body>
<div class="scenes-bar">
  <span class="scene-label">Scenes</span>
  <button class="scene-btn">Intro</button>
  <button class="scene-btn active">Demo</button>
  <button class="scene-btn">Q&A</button>
  <button class="scene-btn clear">Clear</button>
</div>
<div class="panel">
  <div class="label">Current slide</div>
  <div class="frame-wrap"><div class="frame-aspect"><div class="slide-counter">3 / 12</div>(slide iframe)</div></div>
</div>
<div class="panel">
  <div class="label">Next slide</div>
  <div class="frame-wrap"><div class="frame-aspect"><div class="slide-counter">4 / 12</div>(slide iframe)</div></div>
</div>
<div class="panel">
  <div class="label">Speaker notes</div>
  <div class="notes">These are the speaker notes for slide 3. They could be quite long and wrap to several lines. The notes panel allows scrolling if the content overflows.</div>
</div>
<div class="panel">
  <div class="label">Timer</div>
  <div class="timer-wrap">
    <div class="timer-controls" style="margin-bottom:0.4rem;justify-content:center;flex-wrap:wrap;">
      <select id="timer-mode" style="background:#222;color:#ccc;border:1px solid #444;padding:0.2rem 0.4rem;border-radius:4px;font-size:0.85em;">
        <option>Elapsed</option><option>Countdown</option><option>Lap (reset per slide)</option>
      </select>
    </div>
    <div><div class="timer">00:00</div>
    <div class="timer-controls"><button>Start</button><button>Reset</button></div></div>
  </div>
</div>
<div class="panel" style="grid-column: 1 / -1; grid-row: 4; min-height: 0; max-height: min(280px, 35vh);">
  <div class="label" style="display:flex;justify-content:space-between;align-items:center;padding-right:0.6rem;gap:0.5rem;flex-wrap:nowrap;">
    <span style="flex:0 0 auto;">Slides</span>
    <span style="margin-left:auto;display:flex;gap:0.25rem;align-items:center;color:#999;text-transform:none;letter-spacing:normal;font-weight:normal;font-size:0.8em;flex:0 0 auto;">
      <button class="scene-btn active" style="font-size:0.8em;padding:0.1rem 0.4rem;">Text</button>
      <button class="scene-btn" style="font-size:0.8em;padding:0.1rem 0.4rem;">Visual</button>
    </span>
    <span style="color:#999;font-size:0.85em;font-weight:normal;text-transform:none;letter-spacing:normal;flex:0 0 auto;white-space:nowrap;">Slide 3 of 12</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;padding:0.4rem 0.6rem;min-height:0;flex:1 1 auto;overflow-y:auto;">
    ${Array.from({length: 12}, (_, i) => `<button class="scene-btn" style="text-align:left;font-size:0.78em;line-height:1.25;min-height:48px;display:flex;flex-direction:column;gap:3px;padding:6px 8px;"><div style="color:#888;font-size:0.85em;font-weight:600;">${i+1}</div><div>Slide title ${i+1}</div></button>`).join("\\n")}
  </div>
  <div style="display:flex;gap:0.4rem;padding:0.3rem 0.6rem;border-top:1px solid #333;">
    <button class="scene-btn">← Prev</button>
    <button class="scene-btn">Next →</button>
    <button class="scene-btn" style="margin-left:auto;">⏮ First</button>
    <button class="scene-btn">Last ⏭</button>
  </div>
</div>
</body></html>`;

const path = `${outDir}/popup-only.html`;
writeFileSync(path, html);
console.log(`Wrote ${path}`);

const sizes = [
  // Standard / aspirational
  {w: 1100, h: 800, label: "popup-default"},
  {w: 1920, h: 1080, label: "full-hd"},
  // Wide + short — second monitor in landscape
  {w: 1400, h: 500, label: "wide-short"},
  {w: 1600, h: 600, label: "wider-short"},
  // Narrow + tall — portrait monitor
  {w: 500, h: 900, label: "narrow-tall"},
  {w: 600, h: 1000, label: "portrait"},
  // Square / cramped
  {w: 800, h: 800, label: "square"},
  // Small
  {w: 700, h: 600, label: "small"},
  {w: 600, h: 500, label: "tiny"},
  // Very wide
  {w: 2000, h: 700, label: "ultrawide"},
];
for (const size of sizes) {
  await new Promise((res) => {
    const out = `${outDir}/${size.label}-${size.w}x${size.h}.png`;
    const chrome = spawn(CHROME, [
      "--headless=new", "--no-sandbox", "--disable-gpu",
      `--window-size=${size.w},${size.h}`,
      `--screenshot=${out}`,
      "--virtual-time-budget=2000",
      `file://${process.cwd()}/${path}`,
    ]);
    chrome.on("close", () => {
      console.log(`  → ${out}`);
      res();
    });
  });
}
