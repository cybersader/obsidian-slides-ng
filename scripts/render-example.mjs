// Visual smoke for the renderer pipeline — feeds Decks/example.md through
// renderDeck() and writes the resulting iframe-srcdoc HTML to
// test-results/example-deck.html. Open that file in any browser to see
// what the slides-ng iframe will display inside Obsidian.
//
// This is COMPLEMENTARY to the WDIO E2E spec at test/e2e/render.spec.ts:
//   - The WDIO spec proves the full Obsidian → iframe → reveal.js
//     integration (run with `bun run e2e` locally)
//   - This script proves the renderer alone produces correct HTML
//     (run with `bun run smoke:render` — fast, no Obsidian needed)
//
// Per the workspace standing rule (`.claude/skills/testing-patterns/`),
// both should run for any UX-relevant work; this script is the cheap
// local check, the WDIO spec is the integration check.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { renderDeck } from "../src/render/renderDeck.ts";

const INPUT = "Decks/example.md";
const OUT_DIR = "test-results";
const OUT = `${OUT_DIR}/example-deck.html`;

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

const markdown = readFileSync(INPUT, "utf-8");
const html = renderDeck(markdown, INPUT);
writeFileSync(OUT, html);

const sectionCount = (html.match(/<section/g) ?? []).length;
const sizeKb = (html.length / 1024).toFixed(1);

console.log(`[smoke:render] wrote ${OUT}`);
console.log(`[smoke:render]   sections: ${sectionCount}`);
console.log(`[smoke:render]   size:     ${sizeKb} KB`);
console.log(
  `[smoke:render] open in browser:\n  file://${process.cwd()}/${OUT}`
);
