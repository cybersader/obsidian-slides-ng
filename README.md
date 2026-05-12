# Slides NG

> Markdown-based slide decks for Obsidian — lightweight, offline-first, **zero localhost ports, no spawned dev server**.

Slides NG renders your markdown deck inside an `<iframe srcdoc>` in Obsidian using a bundled copy of [reveal.js](https://revealjs.com/). The "Open in browser" command writes a fully self-contained HTML file to your vault and opens it with `electron.shell.openExternal` — fullscreen presentation in your default browser, no port, no localhost.

## Why this exists

The two existing markdown-slide options for Obsidian both have a footprint bigger than the job:

- **Slides Extended** (the trusted in-catalog option) runs an internal HTTP server for its browser-preview mode — some security tools flag the listening localhost port.
- **`nirtamir2/obsidian-slidev`** (the Slidev wrapper) spawns `npm run dev` as a child process and listens on `localhost:3030` — needs Node, npm, and the full Slidev runtime installed.

Slides NG aims for the lightest possible authoring substrate:

- **No HTTP server.** Decks render via `<iframe srcdoc>` directly inside Obsidian.
- **No spawned child process.** Plugin is a single `main.js`; no external Node runtime.
- **No CDN at runtime.** reveal.js, Shiki, and 15 themes are bundled into the plugin.
- **Full-screen presentation mode** still works — exports a standalone `file://` HTML that the user's default browser opens.

## Features

- Renders Obsidian markdown decks via [reveal.js 5](https://revealjs.com/) inside an iframe
- Horizontal slide separators (`---`) + vertical sub-slides (`--`) — match Slides Extended conventions
- 15 bundled themes (black, white, simple, league, beige, sky, night, serif, solarized, blood, moon, dracula, …)
- Per-deck frontmatter for theme, transition, slideNumber
- Plugin settings (Settings → Slides NG) for default theme + default transition
- **Save-watch loop** — saves trigger a debounced (300 ms) iframe re-render
- **Slidev `<v-click>` and `<v-clicks>`** — translated to reveal.js fragments
- **Slidev code line-stepping** — `\`\`\`ts [1|2-3|all]` advances through line-spotlighting steps on click
- **Shiki syntax highlighting** — 11 langs (ts, js, py, bash, html, css, md, json, yaml, go, rust); github-dark theme
- **Speaker notes** — `<!-- ... -->` HTML comments → reveal.js `<aside class="notes">`, surfaced in the speaker view (press `S` in the standalone export)
- **Slidev-style layouts** — `layout:` frontmatter selects from 9 bundled layouts: `default`, `center`, `cover`, `two-cols`, `two-cols-header`, `quote`, `statement`, `section`, `end`. Slot markers `::left::` / `::right::` partition content within multi-column layouts. Missing required slots emit a console warning so silent blank columns can't hide.
- **In-editor autocomplete** — typing `layout: ` in frontmatter, `::` at line start in the slide body, or `<v-` anywhere fires an autocomplete dropdown with the relevant suggestions. The slot-marker dropdown is context-aware and filters to slots actually used by the current slide's layout.
- **Slide annotations** (Slides Extended convention) — `<!-- slide data-auto-animate -->` / `<!-- slide class="hero" -->` / `<!-- slide style="background:#000" -->` placed anywhere on a slide attach to that slide's `<section>` tag. Unlocks reveal.js auto-animate.
- **Element annotations** — `<!-- element class="fragment" -->` immediately after an element folds those attributes into it. `class` and `style` concatenate; other attributes overwrite.
- **Snippet/template expansion** — type `::name` at line start in the slide body; the autocomplete dropdown surfaces ready-made markdown templates (note, cover, two-cols, auto-animate, v-clicks, fragment, code-ts, …) — selecting one fully replaces the `::name` with multi-line markdown. Plain markdown out, no shortcode rendering at runtime.
- **Image layouts** — `image-left`, `image-right`, `image` (full-bleed) — image URL from per-slide frontmatter `image:`. Vault-relative attachments are resolved via Obsidian's adapter; absolute URLs and data URIs pass through. Wikilink form `[[attachment.png]]` also works.
- **Magic-Move** — paired code blocks across consecutive slides sharing `{key=NAME}` get smooth token-morph transitions courtesy of `shiki-magic-move`. Server-side keyed-token computation; bundled vanilla renderer runs inside the iframe.
- **In-Obsidian Speaker Console** — opens alongside the preview as a horizontal split (drag-out to a new window for a true second monitor). Shows slide N / M, elapsed timer (start/pause/reset), navigation controls, blackout toggle, current slide's speaker notes, next-slide preview, and a slide picker (compact or full-list, user-toggleable). Drives the preview iframe via postMessage; no cross-origin shenanigans.
- **Cursor-follow** (default on; togglable in settings) — when the markdown cursor is inside a deck file, the preview jumps to that slide. Counts `---` separators while skipping YAML frontmatter and fenced code blocks.
- **Open in browser** — writes `.slides-ng-export-<timestamp>.html` to the vault, opens via `electron.shell.openExternal` (no port, no spawned server)
- **Export for PDF** — same export workflow, opens with `?print-pdf` so reveal.js flattens the deck for browser-side Print → Save as PDF

## Hard architectural constraints

Codified in `PROJECT_BRIEF.md` §3 and **enforced by a static guard test** (`tests/hardConstraints.test.ts`) that fails the build if any pattern below appears in `src/`:

1. No localhost listening ports.
2. No `child_process.spawn` / `exec`.
3. No `eval` / `Function()` of user content.
4. No external CDN at render time.
5. Single-file `main.js` output.
6. UX-visible features ship with WebdriverIO + screenshot coverage.

## Install

### From source

```bash
git clone https://github.com/cybersader/obsidian-slides-ng.git
cd obsidian-slides-ng
bun install
bun run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into `<your-vault>/.obsidian/plugins/slides-ng/` and enable the plugin in Settings → Community plugins.

### Vault-as-dev-environment

The repo itself is a working Obsidian vault. Open the cloned folder in Obsidian, enable the plugin, and the seed deck at `Decks/example.md` is ready to render. See `.claude/CLAUDE.md` for the day-to-day dev loop.

## Usage

Create a markdown file with deck frontmatter:

````markdown
---
theme: simple
transition: fade
---

# First slide

Hello, world.

---

# Click reveals

<v-clicks>

- Click to reveal
- Then this
- Then this

</v-clicks>

---

# Code line-stepping

```ts [1|2-3|all]
const passphrase = "four random words"
const length = passphrase.split(" ").length
console.log(`length is ${length}`)
```

<!-- Speaker note: walk through why length-over-complexity wins. -->
````

Open the Slides NG preview (ribbon icon or command palette → "Slides NG: Open preview") next to the file. The preview re-renders on save. Click "Open in browser" for full-screen presentation; click "Export for PDF" for browser-side PDF print.

## Dev setup

```bash
bun install
bun run dev               # esbuild watch — outputs to ./.obsidian/plugins/slides-ng/
bun run dev:reload        # same + auto-reload plugin via Obsidian CLI
bun run build             # production build at repo root
bun run lint              # ESLint with obsidianmd rules
bun run test              # bun test (~100 unit tests)
bun run e2e               # WebdriverIO + obsidian-launcher (~10 min, 9 spec files)
bun run smoke:render      # write test-results/example-deck.html for browser inspection
```

The dev loop and testing-pattern docs live at `.claude/skills/testing-patterns/SKILL.md`.

## Architecture

```
slides.md
  → @slidev/parser           # markdown → slides[] + frontmatter
  → marked                    # per-slide markdown → HTML
    └─ Shiki / Slidev line-step transformer for code fences
    └─ <v-click> / <v-clicks> → reveal.js .fragment classes
  → buildIframeHtml           # template wraps slides with bundled reveal.js + theme CSS
  → iframe srcdoc OR vault.adapter.write + electron.shell.openExternal
```

reveal.js + reveal CSS + all 15 themes are inlined at build time by `scripts/generate-reveal-assets.mjs` so the plugin works fully offline.

## Status

v0.5.0 — In-Obsidian Speaker Console + cursor-follow + toolbar polish. v0.1.0 covered the brief's §7 acceptance list; v0.2.0 added 9 named layouts + `::name::` slots; v0.2.1 added the layout metadata registry + validation + in-editor autocomplete; v0.3.0 added Slides-Extended-flavoured `<!-- slide attr -->` / `<!-- element attr -->` annotations; v0.4.0 added template-expansion snippets, three image layouts with Obsidian-attachment path resolution, and Magic-Move via bundled `shiki-magic-move`; v0.5.0 adds the speaker console (drag-to-popout, notes + timer + blackout + picker, driven via iframe postMessage) and editor cursor-follow. See `CHANGELOG.md` for the full delta.

| Phase | Description | State |
|---|---|---|
| M1 | Skeleton + smoke test | ✅ |
| M1.5 | Test infrastructure (WDIO + auto-reload) | ✅ |
| M2 | Static renderer (reveal.js iframe) | ✅ |
| M3 | Save-watch loop | ✅ |
| M4 | Shiki + `<v-click>` / `<v-clicks>` | ✅ |
| M4.5 | 13-fixture coverage library | ✅ |
| M5 | Code line-stepping `[1\|2-3\|all]` | ✅ |
| M6 | Open-in-browser presentation mode | ✅ |
| M7 | Themes + settings tab + PDF print + speaker view | ✅ |
| M8 | v0.1.0 release | ✅ |
| v0.2 | Slidev layouts (9 layouts + `::name::` slots) | ✅ |
| v0.2.1 | Layout registry + render-time validation + in-editor autocomplete | ✅ |
| v0.3.0 | Slide + element annotations (auto-animate, custom classes/IDs, fragment attrs) | ✅ |
| v0.4.0 | Snippet expansion + image layouts + Magic-Move | ✅ |
| v0.5.0 | Speaker console + cursor-follow + toolbar polish | ✅ |

## Features explicitly NOT in v0.1

- Slidev's exact Magic-Move algorithm (the modern standalone `shiki-magic-move` lib is bundled but not yet wired — that's v0.2)
- Vue components inline in slides
- Live HMR via filesystem watcher (the save-reload loop is fast enough)
- Mobile rendering (`isDesktopOnly: true`)

## License

MIT — see [LICENSE](./LICENSE).

## Related projects

- **[Slides Extended](https://github.com/ebullient/obsidian-slides-extended)** — the trusted prior art. Slides NG inherits its annotation conventions (work-in-progress for v0.2) but takes a different transport approach (zero ports vs Fastify-internal HTTP).
- **[Slidev](https://sli.dev/)** — the inspiration for `<v-click>` reveals and code line-stepping. Slides NG implements those syntaxes against bundled standalone libraries (`@slidev/parser`, `shiki-magic-move`) rather than the full Slidev application.
- **[reveal.js](https://revealjs.com/)** — the rendering engine.
- **[cybersader/markup-slides-context-and-workflow](https://github.com/cybersader/markup-slides-context-and-workflow)** — author's reference for markup-slide ecosystem patterns.
