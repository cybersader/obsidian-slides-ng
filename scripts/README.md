# scripts/

Dev-only helpers — NOT bundled into the plugin's `main.js`.

## `test-pdf-export.mjs`

End-to-end PDF export rendering test. Pipes a deck through the
plugin's `renderDeckStandalone` with the requested options, then
spawns headless Chrome (`--print-to-pdf` + `--screenshot`) to
produce a real PDF and a page screenshot. Output lands in
`test-results/pdf-export/<timestamp>/`.

Lets us iterate on PDF-export changes without round-tripping
through Obsidian + browser + print dialog. Validated v0.11.55
produces correct dark slide-card output — proves any rendering
divergence in production is specific to the user's PDF
destination (Microsoft Print to PDF strips backgrounds), not
our HTML.

```bash
# Default: conference-talk + slides-notes layout
bun run scripts/test-pdf-export.mjs

# Document layout
bun run scripts/test-pdf-export.mjs --pdfStyle=document

# Any RenderDefaults option, with grayscale + Letter size
bun run scripts/test-pdf-export.mjs \
  e2e-vault/Decks/01-conference-talk.md \
  --pdfStyle=slides-notes \
  --showNotes=true \
  --grayscale=true \
  --pageSize=letter
```

Requires playwright Chromium installed locally
(`~/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome`)
or `CHROME_PATH=...` env override.
