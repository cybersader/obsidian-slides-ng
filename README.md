# Slides NG

> Markdown-based slide decks for Obsidian — lightweight, offline-first, **zero localhost ports**.

**Status: pre-alpha.** Project brief written; implementation in progress.

## Why this exists

The two existing options for markdown slides in Obsidian both have a footprint that's bigger than the job:

- **Slides Extended** (the trusted, in-catalog option) runs an internal HTTP server for its browser-preview mode — some security tools flag the listening localhost port.
- **`nirtamir2/obsidian-slidev`** (the Slidev wrapper) spawns `npm run dev` as a child process and listens on `localhost:3030` — needs Node, npm, and the full Slidev runtime installed.

Slides NG aims for the lightest possible authoring substrate:

- **No HTTP server.** Decks render via `<iframe srcdoc>` directly inside Obsidian.
- **No spawned child process.** Plugin is a single `main.js`; no Node runtime required separately.
- **No external network calls.** reveal.js, Shiki, and themes are bundled into the plugin.
- **Full-screen presentation mode** still works — exports a standalone `file://` HTML the user's default browser opens (no port; no spawned server).

## Status

| Phase | Description | State |
|---|---|---|
| M1 | Skeleton + smoke test | ⏳ |
| M2 | Static renderer (reveal.js bundled) | ⏳ |
| M3 | Save-watch loop (no port, no spawn) | ⏳ |
| M4 | Shiki + reveal.js fragment glue | ⏳ |
| M5 | Code line-stepping (`[1\|2-3\|all]`) | ⏳ |
| M6 | Open-in-browser presentation mode (file:// export) | ⏳ |
| M7 | Themes + speaker notes + PDF print | ⏳ |
| M8 | v0.1 release | ⏳ |

See `PROJECT_BRIEF.md` for the full architecture, decision log, and acceptance criteria.

## Features (planned for v0.1)

- Renders Obsidian markdown decks via [reveal.js](https://revealjs.com/)
- Slide separators (`---`) + vertical sub-slides (`--`) — matches Slides Extended conventions
- Frontmatter for theme / transition / slide-number / scaling
- `<v-click>` and `<v-clicks>` Slidev-style reveals (via reveal.js fragments)
- Slidev-style code line-stepping: `\`\`\`ts [1|2-3|all]`
- Slide / element annotations: `<!-- slide ... -->`, `<!-- element ... -->`
- Named blocks: `::: name ... :::`
- Speaker notes via `<!-- ... -->` HTML comments
- Shiki code highlighting with line-stepping animation
- Open-in-browser command (writes a static HTML file to the vault, opens via system browser — no port, no server)
- Reveal.js's built-in PDF print mode

## Features explicitly NOT in v0.1

- Slidev's exact Magic-Move algorithm (out of scope — uses Vite-compiled Monaco)
- Vue components inline in slides
- Live HMR via filesystem watcher (the save-reload loop is fast enough)
- Hosted preview / cloud sync / mobile rendering

## Installation

> Not yet available. After v0.1 release, install via:
>
> 1. Obsidian Settings → Community Plugins → Browse → search "Slides NG"
> 2. Install + Enable
>
> Until then: clone this repo, `bun install`, `bun run build`, copy `main.js` + `manifest.json` + `styles.css` into your vault's `.obsidian/plugins/slides-ng/` folder.

## Usage (planned)

Create a markdown file with deck frontmatter:

```markdown
---
slides-ng: true
theme: simple
transition: fade
---

# First slide

Hello, world.

---

# Second slide

<v-clicks>

- Click to reveal
- Then this
- Then this

</v-clicks>

---

# Third slide

\`\`\`ts [1|2-3|all]
const passphrase = "four random words"
const length = passphrase.split(" ").length
console.log(`length is ${length}`)
\`\`\`
```

Open the SlidesNG view (Ribbon icon or command palette → "Slides NG: open preview") next to the file. The preview updates on save. Press the toolbar's "Open in browser" button for full-screen presentation mode.

## Dev setup

```bash
bun install
bun run dev               # watch + rebuild + copy to test-vault
```

Then open `test-vault/` in a separate Obsidian instance. The [Hot Reload](https://github.com/pjeby/hot-reload) plugin reloads SlidesNG automatically when `main.js` changes.

See `PROJECT_BRIEF.md` for the full development plan and phase-by-phase acceptance criteria.

## License

MIT — see [LICENSE](./LICENSE).

## Related

- **[Slides Extended](https://github.com/ebullient/obsidian-slides-extended)** — the trusted prior art. Slides NG inherits its syntax conventions (annotations, named blocks) but takes a different transport approach (zero ports vs Fastify-internal HTTP).
- **[Slidev](https://sli.dev/)** — the inspiration for `<v-click>` reveals and code line-stepping. Slides NG implements these in a Vite-free way for use inside Obsidian.
- **[reveal.js](https://revealjs.com/)** — the underlying rendering engine.
