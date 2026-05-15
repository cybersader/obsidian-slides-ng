#!/usr/bin/env bun
/**
 * Dev tool: matrix testing for the PDF export.
 *
 * For each option combo in a curated set, this script produces:
 *   - mockup.png — what the modal's static mockup would show
 *   - actual.png — what headless Chrome renders from the export HTML
 *   - actual.pdf — the actual PDF output
 *
 * Plus an HTML index that lays out every combo side-by-side so we
 * can spot divergence. Lets us iterate fast on mockup fidelity AND
 * on the underlying export pipeline.
 *
 * Usage:
 *   bun run scripts/test-pdf-matrix.mjs [--only=slides-notes]
 *
 * Output lands in ./test-results/pdf-matrix/<timestamp>/.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { spawn } from "child_process";
import { resolve } from "path";

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/home/cybersader/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome";

if (!existsSync(CHROME_PATH)) {
  console.error(`Chrome not found at: ${CHROME_PATH}`);
  process.exit(1);
}

// ---- CLI -----------------------------------------------------------------

const args = process.argv.slice(2);
const cliOpts = {};
for (const a of args) {
  if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    cliOpts[k] = v ?? true;
  }
}

const deckPath = cliOpts.deck || "e2e-vault/Decks/01-conference-talk.md";

// ---- Combo set -----------------------------------------------------------

/**
 * A pragmatic matrix of high-signal combos. Not every Cartesian
 * product (that would be hundreds). Each combo highlights one or
 * two options worth visually verifying.
 */
const COMBOS = [
  // --- layout x notes ---
  { name: "slides-noNotes", pdfStyle: "slides" },
  { name: "slides-withNotes", pdfStyle: "slides", showNotes: true },
  { name: "slides-notes-emphasis", pdfStyle: "slides-notes" },
  { name: "document-noNotes", pdfStyle: "document" },
  { name: "document-withNotes", pdfStyle: "document", showNotes: true },

  // --- aspect ratio (within slides-notes) ---
  { name: "slides-notes-16x9", pdfStyle: "slides-notes", aspectRatio: "16:9" },
  { name: "slides-notes-4x3", pdfStyle: "slides-notes", aspectRatio: "4:3" },

  // --- page size ---
  { name: "slides-notes-A4", pdfStyle: "slides-notes", pageSize: "a4" },
  { name: "slides-notes-Legal", pdfStyle: "slides-notes", pageSize: "legal" },

  // --- margins ---
  { name: "slides-narrow-margin", pdfStyle: "slides-notes", pageMargin: "narrow" },
  { name: "slides-wide-margin", pdfStyle: "slides-notes", pageMargin: "wide" },
  { name: "slides-no-margin", pdfStyle: "slides-notes", pageMargin: "none" },

  // --- visual options ---
  { name: "grayscale", pdfStyle: "slides-notes", grayscale: true },
  { name: "hideBackgrounds", pdfStyle: "slides-notes", hideBackgrounds: true },
  { name: "slideNumberStamp", pdfStyle: "slides-notes", slideNumberStamp: true },
  { name: "headerFooter", pdfStyle: "slides-notes", headerText: "CS-101 · Lecture 5", footerText: "Draft" },

  // --- experimental overflow ---
  { name: "maxPages-2", pdfStyle: "slides-notes", maxPagesPerSlide: 2 },
  { name: "autoShrink", pdfStyle: "slides", autoShrink: true, showNotes: true },
];

const onlyFilter = cliOpts.only;
const filtered = onlyFilter
  ? COMBOS.filter((c) => c.name.includes(onlyFilter))
  : COMBOS;

// ---- Setup output --------------------------------------------------------

const ts = Date.now();
const outRoot = resolve(`./test-results/pdf-matrix/${ts}`);
mkdirSync(outRoot, { recursive: true });

console.log(`Matrix root: ${outRoot}`);
console.log(`Combos:      ${filtered.length}/${COMBOS.length}`);

// ---- Render mockup (pure JS, no DOM) -------------------------------------

/**
 * Produces a small standalone HTML page that mirrors what the
 * ExportPdfOptionsModal.buildMockup() would build. Kept in sync
 * by hand — when buildMockup() changes, mirror it here. (Later
 * we should extract buildMockup into a pure function shared by
 * both contexts.)
 */
function renderMockup(opts, currentTheme = "black") {
  const isNotesEmphasis = opts.pdfStyle === "slides-notes";
  const isDoc = opts.pdfStyle === "document";
  const showsNotes = isNotesEmphasis || opts.showNotes;
  const theme = opts.hideBackgrounds ? "white" : (opts.themeOverride ?? currentTheme);
  const pageHeight = (
    opts.pageSize === "a4"     ? 283 :
    opts.pageSize === "legal"  ? 330 :
                                 260
  );
  const marginPx = (
    opts.pageMargin === "narrow" ? 7  :
    opts.pageMargin === "wide"   ? 22 :
    opts.pageMargin === "none"   ? 2  :
                                   12
  );
  const cardBg = (
    theme === "white" || theme === "beige" || theme === "simple" || theme === "serif" ? "#f5f5f0" :
    theme === "dracula" ? "#282a36" :
    theme === "solarized" ? "#fdf6e3" :
    "#191919"
  );
  const cardColor = (theme === "white" || theme === "beige" || theme === "solarized" ? "#222" : "#fff");

  const styles = `
    body { margin: 0; padding: 20px; background: #1e1e2e; color: #eee; font-family: sans-serif; }
    .pages-row { display: flex; gap: 12px; align-items: flex-start; justify-content: center; }
    .page {
      width: 200px; height: ${pageHeight}px; background: #fff; color: #222;
      border: 1px solid #c0c0c0; border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
      display: flex; flex-direction: column; padding: ${marginPx}px;
      box-sizing: border-box; overflow: hidden; position: relative;
      ${opts.grayscale ? "filter: grayscale(1);" : ""}
    }
    .page-header, .page-footer {
      font-size: 6px; color: #888; background: #f5f5f5; border: 1px solid #e0e0e0;
      border-radius: 2px; padding: 2px 4px; margin-bottom: 4px;
      text-align: center; white-space: nowrap; overflow: hidden;
    }
    .page-footer { margin-bottom: 0; margin-top: auto; }
    .inner { flex: 1; display: flex; flex-direction: column; min-height: 0; gap: 4px; }
    .card {
      background: ${cardBg}; color: ${cardColor};
      border-radius: 3px; border: 1px solid #444;
      padding: 8px 10px;
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      text-align: center; position: relative; overflow: hidden;
      align-self: center; flex: 0 0 auto;
      aspect-ratio: ${
        opts.aspectRatio === "16:9" ? "16 / 9" :
        opts.aspectRatio === "4:3"  ? "4 / 3"  :
        "960 / 700"
      };
      width: ${
        isNotesEmphasis ? 140 :
        opts.aspectRatio === "16:9" ? 170 :
        opts.aspectRatio === "4:3"  ? 150 :
        160
      }px;
      height: auto;
    }
    .title { font-weight: 800; font-size: 10px; line-height: 1.1; }
    .subtitle { font-size: 6px; margin-top: 3px; opacity: 0.85; }
    .stamp {
      position: absolute; top: 2px; right: 3px; font-size: 5px;
      padding: 1px 3px; background: rgba(0,0,0,0.45); color: rgba(255,255,255,0.85);
      border-radius: 2px; border: 1px solid rgba(255,255,255,0.2);
    }
    .notes {
      background: #fafafa; border-top: 1px solid #ccc;
      padding: 4px 6px; display: flex; flex-direction: column; gap: 2px;
      ${isNotesEmphasis ? "flex: 1; min-height: 0;" : "flex: 0 0 25%;"}
    }
    .label { font-size: 5px; color: #888; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
    .line { height: 3px; background: #999; border-radius: 1px; opacity: 0.55; width: 100%; }
    .line-notes { height: 2px; background: #aaa; }
    .line:nth-child(2) { width: 100%; } .line:nth-child(3) { width: 88%; }
    .line:nth-child(4) { width: 95%; } .line:nth-child(5) { width: 78%; }
    .doc-heading { font-size: 9px; font-weight: 700; color: #222; margin-bottom: 4px; }
    .doc-body { display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px; }
    .doc-notes { border-top: 1px dashed #aaa; padding-top: 4px; display: flex; flex-direction: column; gap: 2px; }
    .caption { text-align: center; font-style: italic; color: #aaa; margin-top: 10px; font-size: 11px; max-width: 500px; margin-left: auto; margin-right: auto; }
  `;
  // page1
  let page1Inner = "";
  let pageBgOverride = "";
  let pageColorOverride = "";
  if (isDoc) {
    // v0.11.65: page-as-slide. The page itself gets the theme bg.
    pageBgOverride = cardBg;
    pageColorOverride = cardColor;
    page1Inner = `
      <div style="font-weight:800;font-size:11px;line-height:1.1;letter-spacing:0.02em;text-align:center;margin-bottom:4px;">BUILDING RESILIENT SYSTEMS</div>
      <div style="font-size:6px;opacity:0.85;text-align:center;margin-bottom:8px;">Lessons from running production for a decade</div>
      <div style="display:flex;flex-direction:column;gap:3px;margin:4px 0 8px 0;">
        ${"<div style='height:3px;background:currentColor;opacity:0.55;width:100%;'></div>".repeat(3)}
      </div>
      ${opts.showNotes ? `<div style="background:rgba(255,255,255,0.92);color:#222;border:1px solid rgba(0,0,0,0.18);border-radius:3px;padding:3px 5px;margin-top:auto;display:flex;flex-direction:column;gap:2px;">
        <div style="font-size:5px;color:#666;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">Notes</div>
        ${"<div style='height:2px;background:#888;border-radius:1px;width:100%;'></div>".repeat(2)}
      </div>` : ""}`;
  } else {
    page1Inner = `<div class="card">
        <div class="title">BUILDING RESILIENT SYSTEMS</div>
        <div class="subtitle">Lessons from running production for a decade</div>
        ${opts.slideNumberStamp ? `<div class="stamp">Slide 1 / 12</div>` : ""}
      </div>
      ${showsNotes ? `<div class="notes">
        <div class="label">Speaker notes</div>
        ${"<div class='line line-notes'></div>".repeat(isNotesEmphasis ? 6 : 3)}
      </div>` : ""}`;
  }
  // optional overflow continuation
  const overflowPage = (opts.maxPagesPerSlide && opts.maxPagesPerSlide > 1)
    ? `<div class="page" style="opacity: 0.92;">
        <div class="inner">
          <div class="label">(cont.)</div>
          ${"<div class='line'></div>".repeat(8)}
        </div>
      </div>`
    : "";
  // summary caption
  const bits = [opts.pdfStyle === "slides-notes" ? "Slides + notes emphasis" : opts.pdfStyle === "document" ? "Document handout" : "Slides (cards with theme)"];
  if (opts.aspectRatio && opts.aspectRatio !== "current") bits.push(opts.aspectRatio);
  if (opts.pageSize && opts.pageSize !== "current") bits.push(opts.pageSize.toUpperCase());
  if (opts.pageMargin && opts.pageMargin !== "normal") bits.push(`${opts.pageMargin} margin`);
  if (opts.grayscale) bits.push("grayscale");
  if (opts.hideBackgrounds) bits.push("no bg");
  if (opts.autoShrink) bits.push("auto-shrink");
  if (opts.maxPagesPerSlide && opts.maxPagesPerSlide > 1) bits.push(`max ${opts.maxPagesPerSlide} pgs/slide`);

  const pageInlineStyle = pageBgOverride
    ? `style="background:${pageBgOverride} !important;color:${pageColorOverride} !important;"`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${styles}</style></head><body>
    <div class="pages-row">
      <div class="page" ${pageInlineStyle}>
        ${opts.headerText ? `<div class="page-header">${opts.headerText}</div>` : ""}
        <div class="inner">${page1Inner}</div>
        ${opts.footerText ? `<div class="page-footer">${opts.footerText}</div>` : ""}
      </div>
      ${overflowPage}
    </div>
    <div class="caption">${bits.join(" · ")}</div>
  </body></html>`;
}

// ---- Run Chrome utility --------------------------------------------------

function chrome(args) {
  return new Promise((res, rej) => {
    const child = spawn(CHROME_PATH, [
      "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
      ...args,
    ]);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => code === 0 ? res() : rej(new Error(`chrome ${code}: ${stderr.slice(-400)}`)));
  });
}

// ---- Render export pipeline ----------------------------------------------

const { renderDeckStandalone } = await import("../src/render/renderDeck.ts");
const md = readFileSync(deckPath, "utf-8");

function deckDefaults(opts) {
  const d = { defaultTheme: opts.themeOverride || "black", forcePrintMode: true };
  if (opts.showNotes) d.forceShowNotes = true;
  if (opts.pdfStyle === "slides-notes") {
    d.forceNotesEmphasis = true;
    d.forceShowNotes = true;
    d.forceMaxPagesPerSlide = 1;
  }
  if (opts.pdfStyle === "document") d.forcePrintDocument = true;
  if (opts.aspectRatio === "16:9") { d.pdfAspectWidth = 1280; d.pdfAspectHeight = 720; }
  if (opts.aspectRatio === "4:3")  { d.pdfAspectWidth = 1024; d.pdfAspectHeight = 768; }
  if (opts.pageSize && opts.pageSize !== "current") d.forcePageSize = opts.pageSize;
  if (opts.pageMargin && opts.pageMargin !== "normal") d.forcePageMargin = opts.pageMargin;
  if (opts.grayscale) d.forceGrayscale = true;
  if (opts.hideBackgrounds) d.forceHideBackgrounds = true;
  if (opts.slideNumberStamp) d.forceSlideNumberStamp = true;
  if (opts.autoShrink) d.forceAutoShrink = true;
  if (opts.headerText) d.forceHeaderText = opts.headerText;
  if (opts.footerText) d.forceFooterText = opts.footerText;
  if (opts.maxPagesPerSlide && opts.maxPagesPerSlide > 1) d.forceMaxPagesPerSlide = opts.maxPagesPerSlide;
  return d;
}

// ---- Run matrix ----------------------------------------------------------

for (const combo of filtered) {
  const dir = `${outRoot}/${combo.name}`;
  mkdirSync(dir, { recursive: true });
  console.log(`→ ${combo.name}`);

  // mockup
  const mockupHtml = renderMockup(combo);
  const mockupPath = `${dir}/mockup.html`;
  writeFileSync(mockupPath, mockupHtml);
  await chrome([
    "--window-size=700,420",
    `--screenshot=${dir}/mockup.png`,
    "--virtual-time-budget=800",
    `file://${mockupPath}`,
  ]);

  // actual export
  const exportHtml = renderDeckStandalone(md, deckPath, deckDefaults(combo));
  const exportPath = `${dir}/export.html`;
  writeFileSync(exportPath, exportHtml);
  // v0.11.63: suppress auto-print so it doesn't collide with
  // headless Chrome's own print-to-pdf flag.
  const url = `file://${exportPath}?print-pdf&slidesNgNoAutoPrint=1${combo.showNotes || combo.pdfStyle === "slides-notes" ? "&showNotes=true" : ""}`;
  await chrome([
    "--window-size=816,1056",
    `--screenshot=${dir}/actual.png`,
    "--virtual-time-budget=2500",
    url,
  ]);
  await chrome([
    `--print-to-pdf=${dir}/actual.pdf`,
    "--no-pdf-header-footer",
    "--virtual-time-budget=2500",
    url,
  ]);

  writeFileSync(`${dir}/options.json`, JSON.stringify(combo, null, 2));
}

// ---- Build index ---------------------------------------------------------

const indexHtml = `<!doctype html><html><head><meta charset="utf-8">
<title>PDF Export Matrix — ${new Date().toISOString()}</title>
<style>
  body { background: #1e1e2e; color: #eee; font-family: ui-sans-serif, system-ui, sans-serif; padding: 1rem 2rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem 0; }
  .meta { color: #888; margin-bottom: 2rem; }
  .combo { margin-bottom: 3rem; border: 1px solid #333; border-radius: 8px; padding: 1rem; background: #2a2a3a; }
  .combo h2 { font-size: 1.1rem; margin: 0 0 0.25rem 0; }
  .combo .opts { color: #aaa; font-size: 0.85rem; font-family: ui-monospace, monospace; margin-bottom: 0.75rem; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .pair > div { text-align: center; }
  .pair img { max-width: 100%; max-height: 600px; background: #fff; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
  .pair .label { font-size: 0.85rem; text-transform: uppercase; color: #aaa; margin-bottom: 0.35rem; letter-spacing: 0.08em; }
  a { color: #82b1ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style></head><body>
<h1>PDF Export Matrix</h1>
<div class="meta">${new Date().toISOString()} · deck=<code>${deckPath}</code> · ${filtered.length} combos</div>
${filtered.map(c => `
  <div class="combo">
    <h2>${c.name}</h2>
    <div class="opts">${JSON.stringify(c)}</div>
    <div class="pair">
      <div>
        <div class="label">Mockup (what the modal shows)</div>
        <img src="${c.name}/mockup.png" alt="${c.name} mockup">
        <div><a href="${c.name}/mockup.html">open mockup html</a></div>
      </div>
      <div>
        <div class="label">Actual export (Chrome render)</div>
        <img src="${c.name}/actual.png" alt="${c.name} actual">
        <div><a href="${c.name}/export.html">open export html</a> · <a href="${c.name}/actual.pdf">open PDF</a></div>
      </div>
    </div>
  </div>
`).join("")}
</body></html>`;
writeFileSync(`${outRoot}/index.html`, indexHtml);

console.log("");
console.log(`Matrix complete. Open ${outRoot}/index.html to compare.`);
