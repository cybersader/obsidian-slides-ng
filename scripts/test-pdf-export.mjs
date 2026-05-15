#!/usr/bin/env bun
/**
 * Dev tool: render a deck through the slides-ng export pipeline,
 * then run headless Chrome to produce a real PDF + page screenshots.
 * Lets us iterate on PDF export changes without round-tripping
 * through the user's Obsidian + browser + print dialog.
 *
 * NOT bundled in the plugin — dev-only.
 *
 * Usage:
 *   bun run scripts/test-pdf-export.mjs [deck.md] [--option=value] [...]
 *
 * Options match PdfExportOptions (showNotes, pdfStyle, aspectRatio, ...).
 * Output lands in ./test-results/pdf-export/<timestamp>/.
 *
 * Examples:
 *   # Default deck + slides-notes layout
 *   bun run scripts/test-pdf-export.mjs \
 *     e2e-vault/Decks/01-conference-talk.md \
 *     --pdfStyle=slides-notes --showNotes=true
 *
 *   # Document layout with grayscale
 *   bun run scripts/test-pdf-export.mjs --pdfStyle=document --grayscale=true
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import { resolve } from "path";

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/home/cybersader/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome";

if (!existsSync(CHROME_PATH)) {
  console.error(`Chrome not found at: ${CHROME_PATH}`);
  console.error("Set CHROME_PATH env var or install playwright Chromium.");
  process.exit(1);
}

// ---- parse args -----------------------------------------------------------

const args = process.argv.slice(2);
const positional = [];
const options = {};
for (const a of args) {
  if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    if (v === undefined) options[k] = true;
    else if (v === "true") options[k] = true;
    else if (v === "false") options[k] = false;
    else if (/^-?\d+$/.test(v)) options[k] = parseInt(v, 10);
    else options[k] = v;
  } else {
    positional.push(a);
  }
}

const deckPath = positional[0] || "e2e-vault/Decks/01-conference-talk.md";
if (!existsSync(deckPath)) {
  console.error(`Deck not found: ${deckPath}`);
  process.exit(1);
}

// ---- render via the plugin's pipeline -------------------------------------

const { renderDeckStandalone } = await import("../src/render/renderDeck.ts");

const md = readFileSync(deckPath, "utf-8");

/** Default RenderDefaults — overridable via CLI flags. */
const defaults = {
  defaultTheme: options.theme || "black",
  forcePrintMode: true,
};
if (options.showNotes) defaults.forceShowNotes = true;
if (options.pdfStyle === "slides-notes") {
  defaults.forceNotesEmphasis = true;
  defaults.forceShowNotes = true;
}
if (options.pdfStyle === "document") {
  defaults.forcePrintDocument = true;
}
if (options.aspectRatio === "16:9") {
  defaults.pdfAspectWidth = 1280;
  defaults.pdfAspectHeight = 720;
} else if (options.aspectRatio === "4:3") {
  defaults.pdfAspectWidth = 1024;
  defaults.pdfAspectHeight = 768;
}
if (typeof options.maxPagesPerSlide === "number") {
  defaults.forceMaxPagesPerSlide = options.maxPagesPerSlide;
}
if (options.grayscale) defaults.forceGrayscale = true;
if (options.hideBackgrounds) defaults.forceHideBackgrounds = true;
if (options.slideNumberStamp) defaults.forceSlideNumberStamp = true;
if (options.pageSize && options.pageSize !== "current") {
  defaults.forcePageSize = options.pageSize;
}
if (options.pageMargin) defaults.forcePageMargin = options.pageMargin;

const html = renderDeckStandalone(md, deckPath, defaults);

// ---- write artifacts ------------------------------------------------------

const ts = Date.now();
const outDir = resolve(`./test-results/pdf-export/${ts}`);
mkdirSync(outDir, { recursive: true });

const htmlPath = `${outDir}/export.html`;
writeFileSync(htmlPath, html);

const optsPath = `${outDir}/options.json`;
writeFileSync(optsPath, JSON.stringify({ deck: deckPath, cliOptions: options, defaults }, null, 2));

console.log(`Wrote ${htmlPath} (${html.length} bytes)`);

// ---- run headless Chrome to produce PDF + screenshots ---------------------

const pdfPath = `${outDir}/export.pdf`;
const shotPath = `${outDir}/page1.png`;
const fileUrl = `file://${htmlPath}?print-pdf${options.showNotes ? "&showNotes=true" : ""}`;

function runChrome(extraArgs) {
  return new Promise((res, rej) => {
    const child = spawn(CHROME_PATH, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      ...extraArgs,
      fileUrl,
    ]);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) res();
      else rej(new Error(`chrome exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

console.log(`Running Chrome → ${pdfPath} ...`);
await runChrome([
  `--print-to-pdf=${pdfPath}`,
  "--no-pdf-header-footer",
  "--virtual-time-budget=2500",
]);
console.log(`Wrote ${pdfPath}`);

console.log(`Running Chrome → ${shotPath} (page 1 screenshot) ...`);
await runChrome([
  `--screenshot=${shotPath}`,
  "--window-size=816,1056", // ~Letter @ 96dpi
  "--virtual-time-budget=2500",
]);
console.log(`Wrote ${shotPath}`);

console.log("");
console.log("Done. Artifacts:");
console.log(`  HTML:        ${htmlPath}`);
console.log(`  PDF:         ${pdfPath}`);
console.log(`  Screenshot:  ${shotPath}`);
console.log(`  Options:     ${optsPath}`);
