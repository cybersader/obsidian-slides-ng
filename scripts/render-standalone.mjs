import { renderDeckStandalone } from "../src/render/renderDeck.ts";
import { readFileSync, writeFileSync } from "fs";
const md = readFileSync("./e2e-vault/Decks/example.md", "utf-8");
const html = renderDeckStandalone(md, "example.md", {});
writeFileSync("./test-results/example-standalone.html", html);
console.log("wrote", html.length, "bytes");
console.log("has Grid button:", html.includes("slides-ng-grid-btn"));
console.log("has S helper:", html.includes("__slidesNgOpenSpeakerView"));
console.log("has 'Speaker view' string:", html.includes("Speaker view"));
