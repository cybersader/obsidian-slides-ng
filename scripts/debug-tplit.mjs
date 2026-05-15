const { renderDeckStandalone } = await import("../src/render/renderDeck.ts");
import { readFileSync } from "node:fs";
const md = readFileSync("./Decks/01-conference-talk.md", "utf-8");
const html = renderDeckStandalone(md, "./Decks/01-conference-talk.md", { defaultTheme: "black" });
const idx = html.indexOf('label.textContent');
console.log("found at:", idx);
const slice = html.slice(idx, idx + 100);
console.log("hex:");
for (let i = 0; i < slice.length; i++) {
  process.stdout.write(slice.charCodeAt(i).toString(16).padStart(2, '0') + ' ');
}
console.log();
console.log("literal:", JSON.stringify(slice));
