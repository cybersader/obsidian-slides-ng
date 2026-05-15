// Extract the popup HTML as a string by calling buildSpeakerPopupHtml
// in a stubbed Node environment. Writes /tmp/popup.html for inspection.
import { readFileSync, writeFileSync } from "node:fs";

const { renderDeckStandalone } = await import("../src/render/renderDeck.ts");
const md = readFileSync("./Decks/01-conference-talk.md", "utf-8");
const deckHtml = renderDeckStandalone(md, "./Decks/01-conference-talk.md", { defaultTheme: "black" });

// Find buildSpeakerPopupHtml and its closing brace.
const startMarker = "function buildSpeakerPopupHtml(deckUrl) {";
const start = deckHtml.indexOf(startMarker);
if (start === -1) throw new Error("not found");
let depth = 0;
let i = start + startMarker.length - 1; // points at "{"
while (i < deckHtml.length) {
  const c = deckHtml[i];
  if (c === "{") depth++;
  else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
  i++;
}
const fnSource = deckHtml.slice(start, i);

// Wrap it as a callable: assign to a const, then call.
const wrapper = `${fnSource}
console.log(buildSpeakerPopupHtml("about:blank"));`;
writeFileSync("/tmp/popup-extract.js", wrapper);
console.log("wrote /tmp/popup-extract.js (" + wrapper.length + " bytes)");
