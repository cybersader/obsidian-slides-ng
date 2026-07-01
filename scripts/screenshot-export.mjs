/**
 * screenshot-export.mjs — render a slides-ng standalone/export HTML with
 * headless Chromium so we can VISUALLY verify the output (esp. PDF/print
 * modes) without a display. Produces both a print-to-PDF (what the user
 * gets when they "Save as PDF") and a full-page PNG.
 *
 * One-time setup (bun blocks puppeteer's postinstall, so fetch Chrome):
 *   bun run screenshot:browser      # == puppeteer browsers install chrome
 *
 * Usage:
 *   bun run screenshot <input.html> [outBasename]
 *   (== bun run scripts/screenshot-export.mjs <input.html> [outBasename])
 *
 * Outputs (under test-results/ by default): <base>.pdf and <base>.png.
 * Rasterise PDF pages to view them, e.g. with pypdfium2:
 *   python3 -c "import pypdfium2 as p; d=p.PdfDocument('x.pdf'); \
 *     [d[i].render(scale=1.6).to_pil().save(f'x-{i}.png') for i in range(len(d))]"
 * Reads print CSS + backgrounds; waits for reveal to finish laying out.
 */
import puppeteer from "puppeteer";
import { resolve, basename } from "node:path";
import { existsSync } from "node:fs";

const input = process.argv[2];
if (!input || !existsSync(input)) {
  console.error("usage: bun run scripts/screenshot-export.mjs <input.html> [outBase]");
  process.exit(1);
}
const inPath = resolve(input);
const outBase = resolve(
  process.argv[3] || `./test-results/${basename(input).replace(/\.html?$/i, "")}`
);

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
});
try {
  const page = await browser.newPage();
  page.on("console", (m) => console.log("[page]", m.text().slice(0, 200)));
  page.on("pageerror", (e) => console.log("[page-error]", String(e).slice(0, 300)));

  await page.goto("file://" + inPath, { waitUntil: "networkidle0", timeout: 60000 });

  // Wait for reveal to finish print-layout: it adds `.ready` to `.reveal`.
  await page
    .waitForFunction(
      () => document.querySelector(".reveal")?.classList.contains("ready"),
      { timeout: 20000 }
    )
    .catch(() => console.log("(reveal .ready not detected within 20s — continuing)"));
  // A beat for the pdf post-init (page cards, header/footer, notes layout).
  await new Promise((r) => setTimeout(r, 1500));

  // The true print artifact — honors @media print, @page size, print-pdf class.
  await page.pdf({
    path: outBase + ".pdf",
    printBackground: true,
    preferCSSPageSize: true,
    timeout: 60000,
  });
  console.log("wrote", outBase + ".pdf");

  // Also a full-page PNG in print emulation, for a quick single-image glance.
  await page.emulateMediaType("print");
  await page.screenshot({ path: outBase + ".png", fullPage: true });
  console.log("wrote", outBase + ".png");
} finally {
  await browser.close();
}
