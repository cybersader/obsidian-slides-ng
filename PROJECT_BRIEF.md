# obsidian-slides-ng — Project Brief & Agent Handoff

> **Status:** Brief written 2026-05-11. Scope revision 2026-05-11 (Slidev libs in scope; Magic-Move in scope; see §4). M1 implementation in progress.
> **Purpose:** Complete handoff document for a fresh Claude Code session to develop this plugin. Everything you need to start coding is in this doc plus its referenced files. **Read this entire document before writing any code.**

---

## 1. Mission

Build a lightweight Obsidian plugin (`slides-ng`) that renders markdown-based slide decks **inside Obsidian** with **zero localhost ports**, **zero spawned dev-server processes**, **and zero external network exposure**. Inspired by [Slides Extended](https://github.com/ebullient/obsidian-slides-extended)'s good architectural ideas (in-Obsidian rendering, syntax annotations) and [Slidev](https://sli.dev/)'s great pedagogical features (`<v-click>` reveals, Magic-Move-style code morph, Shiki highlighting) — but without either's transport/runtime baggage.

**Target user:** the plugin's author wants to author technical-workshop slide decks in Obsidian without depending on a localhost dev server or external runtime. First downstream consumer is a workshop-deck project scaffolded in parallel at `1 Projects, Workspaces/mods-workshop-1/`; that project currently uses Slidev directly and will migrate to `slides-ng` once v0.2 ships.

## 2. Why a new plugin? (What was rejected and why)

A fresh Claude session might reasonably ask "why not just use X?" Three serious alternatives were considered and rejected during the 2026-05-11 design conversation. **Don't re-derive these choices — they're documented here to prevent re-litigation.**

### Rejected: `nirtamir2/obsidian-slidev` (third-party plugin)

- Spawns `npm run dev` via `child_process.spawn(..., { shell: true })` — a Vite dev server on `localhost:3030`.
- Not in the official Obsidian community plugin catalog (would require sideloading).
- Sub-1.0 version (0.0.17), ~30 stars, single maintainer.
- Bundled `slidev-template/` subdir gets dropped into the user's vault config dir.
- Source audit: code is **not malicious** (full audit completed 2026-05-11), but architecture is inherently fat — Node + npm + Vite + spawned server + listening port.
- **Disqualifying:** security tools (AV / endpoint protection / corporate firewalls) flag listening localhost ports as suspicious. Personal-machine annoying; deal-breaker for any shared-machine deployment.

### Rejected: stay on Slides Extended (reveal.js) without extending it

- Slides Extended is well-built, in the official catalog, trusted, and the user already has it installed.
- Its **browser preview mode** opens a localhost port (uses Fastify internally for full-deck rendering); this is the part that triggers security tools.
- Doesn't support Slidev-style `[1|2-3|all]` code line stepping or Magic-Move polish.
- Forking it is a huge undertaking (50k+ LoC tied to reveal.js).
- **Disqualifying:** doesn't escape the port issue when presenting; missing the killer pedagogical features for tech-explainer content.

### Rejected: Slidev static-build (`slidev build`) wrapper plugin

- Plugin watches `slides.md`, runs `slidev build` on save, displays the static `dist/` in an iframe.
- Eliminates the listening port but **still requires Node + Slidev installed** + spawned child process per save.
- AV concerns shift but don't disappear; runtime footprint stays heavy.
- **Disqualifying:** too much external state for what should be a lightweight authoring loop.

### Rejected: WebContainers / esbuild-wasm / in-browser Vite

- Run a full Node/Vite environment inside the Obsidian renderer via WebAssembly.
- **WebContainers** are licensing-restricted (StackBlitz commercial license required for commercial use; ~10–15 MB WASM payload).
- **esbuild-wasm + bundled Shiki + Vue runtime** would be ~10 MB plugin payload for marginal benefit.
- **Disqualifying:** overkill on bundle size + ambiguous licensing for an MIT plugin in the community-plugin catalog. We don't need to run Vite, we just need to render markdown→HTML→reveal.js. No transform pipeline.
- **NOT permanently dead:** logged as a future-research note at `docs/research/webcontainers-future-research.md`. If StackBlitz changes licensing or the runtime gets a heavy slim-down, this is the only known route to 100% native Slidev fidelity inside Obsidian. Revisit then.

### The chosen approach

**Render directly into an `<iframe srcdoc>` (or sandboxed webview) inside an Obsidian view, with no HTTP server at all.** Generate a single HTML string per render containing reveal.js + Shiki + the parsed slide content. On `slides.md` save, regenerate the srcdoc → iframe reloads. For presentation mode, write the same HTML to a temp `file://` path and open with `shell.openExternal()` — the browser handles fullscreen via F-key + native fullscreen API. **No port, ever.**

## 3. Architecture (chosen)

### High-level dataflow

```
slides.md  ─►  Parser (own module, inspired by Slides Extended syntax)
              │
              ▼
       Internal AST (slides[] + annotations)
              │
              ▼
        Render-to-HTML (reveal.js template + Shiki for code + custom CSS)
              │
              ├──► iframe.srcdoc (in-Obsidian preview pane)
              └──► fs.writeFile(tmpfile.html) → shell.openExternal('file://tmpfile.html')
                                                (presentation mode, in user's default browser)
```

### Key components

| Component | What it does | Bundle source |
|---|---|---|
| **`SlidesNGPlugin`** | Main Obsidian plugin class (extends `Plugin`); registers view + commands + settings | Hand-written TS (~200 LoC) |
| **`SlidesNGView`** | Custom Obsidian `ItemView` containing the preview iframe + toolbar | Hand-written TS (~200 LoC) |
| **`parseDeck()`** | Markdown → internal AST (slides, annotations, named blocks, frontmatter, layouts) | Wrapped around `@slidev/parser` (bundled). Adds Slides-Extended-flavored extensions (`<!-- slide --> / <!-- element -->` annotations) on top of the Slidev AST. |
| **`renderDeck()`** | AST → single HTML string ready for srcdoc / standalone export | Hand-written; templates reveal.js boilerplate around content, translates Slidev AST nodes to reveal.js fragments / sections |
| **reveal.js** | Bundled JS for actual slide rendering, transitions, fragments, auto-animate | `npm i reveal.js` — bundle into main.js via esbuild |
| **Shiki** | Code syntax highlighting, including line-stepping `[1\|2-3\|all]` | `npm i shiki` — Shiki has a "fine-grained bundle" mode; load only the langs you need |
| **`shiki-magic-move`** | Smooth code-block morphing between slides (Slidev's Magic-Move algorithm, standalone) | `npm i shiki-magic-move` — framework-agnostic. We use the vanilla adapter, no Vue needed. |
| **`@slidev/parser`** | Slidev markdown parser as a standalone npm lib | `npm i @slidev/parser` — gives us frontmatter, slide separators, layout slots, line-step syntax, code-block flags, all for free |
| **Slidev theme CSS** | Themes bundled as pure CSS (no Vue) | `npm i @slidev/theme-default @slidev/theme-seriph` — extract the CSS at build time, bundle into `styles.css` |
| **`exportStandalone()`** | Same renderer, but writes to a temp file and `shell.openExternal()` it | Hand-written (~50 LoC) |

### Hard constraints (do NOT violate these)

1. **No localhost listening ports.** Period. If you ever feel the need to start an HTTP server, you've designed yourself into a corner — back up.
2. **No `child_process.spawn` / `exec` of user-supplied or templated shell commands.** No `npm run dev`. No bundled `node_modules/` runtime requirement on the user's side.
3. **No `eval` / `Function()` of user content** beyond what Obsidian's iframe sandbox naturally permits.
4. **No external CDN calls at render time.** Bundle reveal.js + Shiki + theme CSS into main.js. The whole point is offline-first, network-free authoring.
5. **Single-file `main.js` output.** Standard Obsidian plugin build. No external runtime deps the user has to install.
6. **UX-visible features ship with WDIO + screenshot coverage.** Any feature that affects what the user sees (view, theme, layout, animation, modal, command output) gets at least one WebdriverIO spec under `test/e2e/` that drives the feature end-to-end, asserts on the DOM, and saves a screenshot to `test-results/`. Unit tests on rendered HTML are necessary but not sufficient. The rule is about validating pixels through the real Obsidian → iframe → reveal.js stack, not test count. See `.claude/skills/testing-patterns/SKILL.md`.

### Soft goals

- Total bundled `main.js` ≤ **2 MB**:
  - reveal.js core: ~150 KB
  - Shiki + a handful of langs (ts, js, py, bash, html, css, md): ~600 KB
  - `@slidev/parser`: ~80 KB
  - `shiki-magic-move` (vanilla adapter): ~100 KB
  - Slidev theme CSS (default + seriph): ~50 KB
  - Plugin code: ~150 KB
  - Remaining budget: ~870 KB for fonts/icons/extra langs
- Save → preview reload < **500 ms** (just re-render the srcdoc; reveal.js re-initializes inside the iframe).
- First-render < **1 s** on a typical deck.

## 4. Feature set — what to build (and what NOT to)

### v0.1 minimal viable plugin (MVP)

- Custom view (`SlidesNGView`) registered on Obsidian's right pane
- Toolbar with: **Reload**, **Open in browser (presentation mode)**, **Settings**
- Parser handles **horizontal slide separators** (`---` on its own line) and **vertical sub-slides** (`--`) — match Slides Extended's syntax
- Frontmatter for deck-level config: theme name, transitions, slideNumber, etc.
- Reveal.js renders the deck; default theme `black` or `simple`
- Open-in-browser command writes to `app.vault.adapter.getBasePath() + '/.slides-ng-export.html'`, then `electron.shell.openExternal('file://...')`

### v0.2 — Slidev-flavored features

- **`<v-click>` reveals** — translate to reveal.js `.fragment` class on the element
- **`<v-clicks>` block** — apply `.fragment` to each child element of a wrapped list/table
- **Code line-stepping syntax** — `\`\`\`ts [1|2-3|all]` — render via Shiki + custom reveal.js plugin that swaps highlighted line ranges as the user clicks. **This is the killer feature; do it well.**
- **Slide / element annotations** — `<!-- slide style="..." -->`, `<!-- element class="..." -->` (Slides Extended pattern)
- **Named blocks** — `::: title ... :::` etc. (Slides Extended pattern, used for template slot filling — but skip the templating-from-other-files mechanism for v0.2)

### v0.3 — polish

- **Auto-animate** — already in reveal.js; document the syntax for users (`data-auto-animate` slide attribute + `data-id` on elements)
- **Magic-Move (code morphing)** — bundle `shiki-magic-move` (the standalone, framework-agnostic library that *is* Slidev's Magic-Move algorithm, extracted from Slidev). Triggered by Slidev's `{*|2-3|all}` or `{at:'+1'}` syntax in fenced code blocks across consecutive slides.
- **Speaker notes** — HTML comments at the bottom of each slide (`<!-- ... -->`); render in reveal.js's speaker view when triggered with `S` in the browser-mode export
- **Theme CSS bundle** — 2-3 prebuilt themes: default (clean), seriph (Slidev's seriph extracted to CSS); a third author-branded theme can be added later
- **Slide overview** (reveal.js `o` key) — already free with reveal.js
- **Embedded video helpers** — small CSS + JS sugar for `<video autoplay muted>` + `onended="Reveal.next()"` patterns (the GIF-replacement pattern documented in `cybersader/markup-slides-context-and-workflow`)
- **PDF export** — reveal.js has print-mode CSS; standalone export with `?print-pdf` query string

### Deliberately OUT of scope (v0.x — don't even consider these)

- ❌ **Vue components inline in slides** — would require bundling Vue 3 runtime (~60 KB) + porting Slidev's Vite-time component matching to runtime JS. Not worth it for v0.x. (May revisit for v1.x — see Path C in §13.)
- ❌ **Slidev's Monaco editor mode** — Monaco is ~3 MB; over our budget. Users wanting live code editing can use the standard Obsidian editor in another pane.
- ❌ **Slidev drawings (`d`-key mode)** — Vue-runtime feature; could be reimplemented as a reveal.js plugin later, out of v0.x scope.
- ❌ **Live HMR via a watcher** — the save-reload loop is fast enough; no need for a watcher
- ❌ **Multi-deck index / browser** — outside the rendering core
- ❌ **Cloud sync of decks** — not a slide-rendering concern
- ❌ **Hosted preview server** — explicit anti-goal (the whole reason this plugin exists)
- ❌ **Mobile rendering (Obsidian mobile)** — `isDesktopOnly: true` in manifest
- ❌ **Camera overlay / recording mode** — Slidev runtime feature, no equivalent need here

If you (the next-session agent) are tempted to add any of these "because it'd be easy" — STOP. Each one violates the architectural constraints OR the lightweight goal. Push back on the user before implementing.

## 5. Stack / build pipeline

Match the patterns from the user's sibling plugin `obsidian-daily-notes-ng`:

- **Language:** TypeScript
- **Package manager:** **bun** (the user uses bun, not npm/pnpm — `bun install`, `bun run dev`)
- **Bundler:** **esbuild** via a `esbuild.config.mjs` script
- **Testing:** **bun test** (not jest)
- **Linter/formatter:** **eslint** + **prettier**, per the existing user configs
- **Output:** single `main.js` (built), plus `manifest.json`, `styles.css`
- **Build commands:** `bun run dev` (watch), `bun run build` (production)

### Critical file layout (target — vault-as-dev-environment pattern)

The project folder **is** the dev vault. Same pattern as `crosswalker-obsidian-plugin/`. No separate `test-vault/` subdir.

```
obsidian-slides-ng/               <- git repo root AND Obsidian vault root
├── .claude/
│   └── CLAUDE.md                 # Plugin-specific Claude instructions (already exists)
├── .git/                         # The git repo
├── .github/
│   └── workflows/
│       └── release.yml           # Tag-triggered release (model after daily-notes-ng)
├── .gitignore                    # Vault-aware: ignores workspace.json, build output, etc.
├── .obsidian/                    # Obsidian vault config — PARTIALLY committed
│   ├── plugins/
│   │   ├── slides-ng/            # esbuild outputs HERE — only manifest.json is committed
│   │   │   ├── main.js           # gitignored (build artifact)
│   │   │   ├── manifest.json     # symlink or copy of the root manifest.json
│   │   │   └── styles.css        # symlink or copy of the root styles.css
│   │   └── hot-reload/           # gitignored — dev dependency (recommended)
│   ├── community-plugins.json    # committed (lists slides-ng + hot-reload as enabled)
│   ├── core-plugins.json         # committed
│   ├── app.json                  # committed (sensible defaults)
│   ├── appearance.json           # committed (theme choice)
│   └── workspace*.json           # GITIGNORED (per-user UI state)
├── Decks/                        # Test/example decks (a few committed; user adds more locally)
│   ├── example.md
│   └── README.md                 # "How to test the plugin against these decks"
├── docs/
│   ├── syntax.md                 # User-facing syntax cheat
│   └── architecture.md           # Architectural decisions doc
├── src/
│   ├── main.ts                   # Plugin entry — exports SlidesNGPlugin as default
│   ├── SlidesNGPlugin.ts         # Main Plugin subclass
│   ├── SlidesNGView.ts           # Custom ItemView (preview pane)
│   ├── SlidesNGSettingTab.ts     # Settings UI
│   ├── parser/
│   │   ├── parseDeck.ts          # Markdown → internal AST
│   │   ├── annotations.ts        # <!-- slide --> + <!-- element --> + ::: blocks
│   │   └── frontmatter.ts        # YAML frontmatter parsing
│   ├── render/
│   │   ├── renderDeck.ts         # AST → HTML string
│   │   ├── revealTemplate.ts     # reveal.js HTML scaffold
│   │   ├── shiki.ts              # Shiki integration + line-stepping plugin
│   │   └── themes/               # Bundled theme CSS
│   ├── export/
│   │   └── exportStandalone.ts   # Write HTML to disk + shell.openExternal()
│   └── types.ts                  # Internal type defs
├── manifest.json                 # Canonical Obsidian plugin manifest (committed)
├── styles.css                    # Plugin styles — built; symlinked to .obsidian/plugins/...
├── package.json                  # bun config
├── bunfig.toml
├── esbuild.config.mjs            # Outputs main.js → .obsidian/plugins/slides-ng/main.js
├── eslint.config.mjs
├── tsconfig.json
├── LICENSE                       # MIT, attribute cybersader
├── README.md                     # Public-facing
├── CHANGELOG.md                  # Keep-a-Changelog format
└── PROJECT_BRIEF.md              # THIS DOC — canonical reference
```

### Dev loop (vault-as-dev-environment)

The project folder IS the dev vault. No copy step needed.

1. `bun run dev` — esbuild watches `src/` and writes `main.js` directly to `.obsidian/plugins/slides-ng/main.js`
2. Open the project folder itself in Obsidian as a vault (one of the user's existing Obsidian instances)
3. Enable the **Hot Reload** community plugin in this vault (it watches `main.js` mtime and reloads slides-ng)
4. Make code changes → main.js rebuilds → Hot Reload triggers → see the change in < 2s
5. Test decks at `Decks/*.md` open them in the vault to exercise the plugin

**Manifest sync:** esbuild also copies `./manifest.json` and `./styles.css` to `.obsidian/plugins/slides-ng/` on each build, so the manifest source-of-truth stays at repo root (where releases pick it up).

### Why this pattern over a separate test-vault

- No `copy-files.mjs` step
- The plugin lives where Obsidian expects it; no symlink dance
- Vault content (test decks, `.obsidian/community-plugins.json`) is versioned alongside the plugin source
- Cloning the repo gives a fresh contributor a working dev vault in one command
- Matches `crosswalker-obsidian-plugin/` convention in this workspace

## 6. Public repo + release plan

- **GitHub remote:** `https://github.com/cybersader/obsidian-slides-ng` (already reserved by the user)
- **Visibility:** **Public** from day one. The user said: "It'll have to be a public repository at some point too, if not right away."
- **License:** **MIT** (matches sibling plugins).
- **No AI co-author lines in commits** (workspace convention — already enforced in workspace-level `.git` hook per memory file).
- **Release flow:** match `obsidian-daily-notes-ng/.github/workflows/release.yml` — tag-triggered GitHub Action that builds `main.js` + `manifest.json` + `styles.css` and attaches them to a release.
- **Community plugin submission:** Once v0.1 ships and is stable for 2+ weeks, submit to the [Obsidian community plugin catalog](https://github.com/obsidianmd/obsidian-releases). Plugin ID: `slides-ng`.

## 7. Acceptance criteria (definition of done — v0.1 ship)

The MVP can ship when:

- [ ] `bun run build` produces a single `main.js` under 2 MB
- [ ] Plugin loads in Obsidian 1.4+ without console errors
- [ ] Opening the SlidesNG view next to a `.md` file with deck frontmatter renders the deck via reveal.js in an iframe
- [ ] Editing the `.md` and saving triggers a re-render within 500 ms
- [ ] **No localhost port is ever opened** (verify via `netstat` while running)
- [ ] **No child process is spawned** (verify via process monitor)
- [ ] "Open in browser" command writes a standalone HTML file and opens it in the user's default browser; the standalone version uses reveal.js's built-in fullscreen handler
- [ ] At least one bundled theme renders cleanly
- [ ] Code blocks render with Shiki highlighting
- [ ] `<v-click>` syntax produces a working click reveal
- [ ] Speaker notes via `<!-- ... -->` HTML comments are visible in reveal.js speaker mode
- [ ] README has install instructions + screenshot
- [ ] LICENSE is MIT
- [ ] First GitHub release tagged `0.1.0` with the built artifacts attached

## 8. Source-of-truth references (all paths real)

### Inspirational / pattern-source projects

- **Slides Extended** (the prior art for in-Obsidian rendering): `https://github.com/ebullient/obsidian-slides-extended`
  - The user has a local context fork with cheatsheets: `/mnt/c/Users/Cybersader/Documents/4 VAULTS/plugin_development/obsidian-extended-slides-context/docs/01-cheatsheet.md` (~900 lines — read this for syntax patterns to match)
- **Slidev** (the inspiration for v-click + code line-stepping): `https://github.com/slidevjs/slidev`
- **reveal.js** (the rendering engine we'll bundle): `https://github.com/hakimel/reveal.js`
- **Shiki** (code highlighting): `https://github.com/shikijs/shiki`

### Sibling plugin to mirror (build / release / .claude conventions)

- `/mnt/c/Users/Cybersader/Documents/4 VAULTS/plugin_development/obsidian-daily-notes-ng/`
  - `package.json` — bun + esbuild config
  - `esbuild.config.mjs` — the build script
  - `copy-files.mjs` — test-vault hot-reload pattern
  - `.github/workflows/release.yml` — tag-triggered release
  - `manifest.json` — manifest format

### Workspace conventions

- `/mnt/c/Users/Cybersader/Documents/4 VAULTS/plugin_development/.claude/CLAUDE.md` — workspace-level guidance (23 KB; read sections on "Obsidian Testing Limitations" + "LLM Development Workflow")
- `/mnt/c/Users/Cybersader/Documents/4 VAULTS/plugin_development/OBSIDIAN_PLUGIN_PUBLISHING.md` — community-plugin submission flow
- `/mnt/c/Users/Cybersader/Documents/4 VAULTS/plugin_development/OBSIDIAN_TESTING_LIMITATIONS.md` — what Claude can / can't see when developing Obsidian plugins (Obsidian's dev console is invisible to Claude — design for file-based logging)

### Downstream consumer (workshop-deck reference project)

- `/mnt/c/Users/Cybersader/Documents/1 Projects, Workspaces/mods-workshop-1/` — workshop-deck reference project scaffolded in parallel
- `/mnt/c/Users/Cybersader/Documents/1 Projects, Workspaces/mods-workshop-1/PLAN.md` — slide outline this plugin will eventually render
- **Note:** that project currently uses Slidev directly (tiled-window workflow). When `slides-ng` reaches v0.2 (with `<v-click>` + code line-stepping), it can migrate. Don't assume the migration happens automatically.

### Adjacent agentic-workflow context

- `/mnt/c/Users/Cybersader/Documents/1 Projects, Workspaces/mcp-workflow-and-tech-stack/` — the user's scaffold; this plugin will eventually have a pattern doc added to `02-stack/01-ai-coding/patterns/` once stable
- `/mnt/c/Users/Cybersader/Documents/1 Projects, Workspaces/mcp-workflow-and-tech-stack/profiles/bashrc-snippets/local-search-helpers.sh` — when the dev agent needs to search across the user's projects, source this file and use `cks` / `obs-search` rather than `find`/`grep` (workspace convention — see memory file at `~/.claude/projects/.../memory/feedback_prefer_local_search_over_find.md`)

## 9. Author motivation (out-of-scope context)

This plugin is a means, not an end. The slides-ng authoring substrate backs several downstream uses (technical workshops, explainer-video deck content, generally any markdown-authored deck that needs to run offline with no localhost dependency). The personal motivations behind those uses are out of scope for this brief; what matters here is the constraints they generate — offline-first, no port, no spawned process, single-bundle, deterministic standalone export.

## 10. Implementation phases — recommended order

**Phase M1 — Skeleton + smoke test (4-6 hr)**
- `bun init` + add deps (`obsidian`, `reveal.js`, `shiki`, eslint, esbuild)
- Wire `manifest.json`, `package.json`, `esbuild.config.mjs`, `tsconfig.json` from the daily-notes-ng siblings
- `src/main.ts` exports a no-op `SlidesNGPlugin` — verify it loads in `test-vault/` with no errors
- One placeholder command "Open SlidesNG View" that opens an empty pane
- First commit + push to `https://github.com/cybersader/obsidian-slides-ng`

**Phase M1.5 — Test infrastructure (2-3 hr)**
- `wdio-obsidian-service` config + smoke spec (real Obsidian boot, plugin loaded, command registered, view opens)
- Iframe-aware E2E helpers (`switchToSlideFrame`, `waitForSlides`, etc.) — slides-ng-specific; every later spec depends on these
- `bun test` scaffolding (`tests/preload.ts`, first passing test)
- Auto-reload esbuild `onEnd` hook gated by `AUTORELOAD=1` — `bun run dev:reload` triggers `plugin:reload id=slides-ng` via the official Obsidian CLI after every successful rebuild (~1–2 s save-to-pixel)
- `.claude/skills/obsidian-cli/SKILL.md` and `.claude/skills/testing-patterns/SKILL.md` — agent-facing reference docs
- Five iteration loops documented (unit watch / auto-reload preview / manual reload / E2E smoke / E2E full); visual regression deferred to M5 (magic-move)

**Phase M2 — Static renderer (6-8 hr)**
- `parseDeck()` — slice on `\n---\n` and `\n--\n`, parse frontmatter
- `renderDeck()` — template a static reveal.js HTML page with the slides embedded
- `SlidesNGView` — show the rendered HTML in an `<iframe srcdoc>` inside the Obsidian view
- Reload button → re-render
- Smoke test: a 5-slide manual deck renders correctly

**Phase M3 — Save-watch loop (2-3 hr)**
- Hook `app.vault.on('modify', ...)` for the active `slides.md` file
- Debounced re-render of the iframe on save
- Verify no port / no spawn (via `netstat -an` and Process Explorer)

**Phase M4 — Shiki + reveal.js fragment glue (4-6 hr)**
- Bundle Shiki with a sensible default lang set (typescript, javascript, python, bash, html, css, markdown)
- Code block highlighting end-to-end
- `<v-click>` → `<span class="fragment">` (simple pass at parse time)
- `<v-clicks>` block wrapping → apply class to each child

**Phase M5 — Code line-stepping (the killer feature — 4-6 hr)**
- Custom reveal.js plugin that watches a code block's data attributes for line-step state
- Parse `\`\`\`ts [1|2-3|all]` and produce multiple `<pre>` blocks with reveal.js fragment links
- This is the "you can write tech tutorials with this" moment

**Phase M6 — Open-in-browser presentation mode (2-3 hr)**
- "Open in browser" toolbar button
- Write to `<vault>/.slides-ng-export-<timestamp>.html`
- `electron.shell.openExternal('file://...')` opens user's default browser
- Reveal.js's `F` key handles fullscreen — no additional code needed on our side
- Document this clearly in README ("works for projector presentations — no port, no localhost")

**Phase M7 — Themes + speaker notes + PDF print (4-6 hr)**
- 2-3 bundled themes; settings panel to pick one
- Speaker notes via `<!-- ... -->` HTML comments → reveal.js `<aside class="notes">`
- PDF print mode (reveal.js's print stylesheet — append `?print-pdf` to the standalone export URL, then user uses browser's "Print to PDF")

**Phase M8 — v0.1 release (2-3 hr)**
- README polish (with screenshots — Claude can't see them; user has to capture)
- CHANGELOG.md
- LICENSE finalized
- GitHub Action for tag-triggered release (copy from daily-notes-ng)
- Tag v0.1.0; first public release

**Estimated total to v0.1:** ~30-40 hours of focused work, splittable across 4-6 sessions.

## 11. Risk + mitigation log (decisions parking lot)

| Risk | Mitigation | Notes |
|---|---|---|
| reveal.js inside an iframe has limited control from the parent (Obsidian) | Use `postMessage` if we ever need parent→iframe commands; for v0.1, no commands flow that way | Acceptable |
| Shiki bundle is large | Use Shiki's "fine-grained" bundle mode (lazy-load langs) | Watch the bundle size |
| User wants Magic-Move | Document clearly that this is NOT v0.x scope. Reveal.js `data-auto-animate` covers 80% of the visual goal | Out of scope until v1.0 maybe |
| User wants Vue components inline | Same as above — not v0.x. Recommend custom HTML + reveal.js plugins for the specific needs | Out of scope |
| Test-vault hot-reload feels slow | The Hot Reload plugin reloads in ~1s typically; if slow, profile esbuild | Likely fine |
| AV flags the standalone HTML file | The file is `file://`-scheme, not localhost, so should not trigger network-monitoring tools. If AV flags it, investigate — should not happen | Worth verifying once |
| AV / EDR flags Slides Extended's browser-preview mode | Empirical: user reported security tools flagging Slides Extended when its browser-mode listens on a localhost port — "something COM-process-related" (exact details forgotten, but the pattern is real). This is one of the strongest reasons we're choosing the zero-port approach: many corporate / parental-control / endpoint-protection products treat unexpected localhost listeners as suspicious behavior, especially when spawned by a non-browser process. | Architectural validation for the zero-port choice |

## 12. Pre-flight checklist for the next-session agent

Before writing any code, read these in order:

1. **This document, in full** — yes the whole thing
2. `/mnt/c/Users/Cybersader/Documents/4 VAULTS/plugin_development/.claude/CLAUDE.md` (workspace conventions)
3. `/mnt/c/Users/Cybersader/Documents/4 VAULTS/plugin_development/OBSIDIAN_TESTING_LIMITATIONS.md` (what you can't see)
4. `/mnt/c/Users/Cybersader/Documents/4 VAULTS/plugin_development/obsidian-daily-notes-ng/package.json` + `esbuild.config.mjs` + `manifest.json` (your sibling pattern)
5. `/mnt/c/Users/Cybersader/Documents/4 VAULTS/plugin_development/obsidian-extended-slides-context/docs/01-cheatsheet.md` (syntax patterns to inherit)
6. Skim `https://revealjs.com/` and `https://shiki.style/` for the rendering pieces
7. Confirm with the user what phase they want started — don't assume M1

When ready, ask the user:
- "Should I initialize the git repo + first commit, or is there an existing init pattern (signed commits, GPG, etc.) I should follow?"
- "Anything in M1 you want differently before I start?"

Then start. Update this brief as decisions are made — the brief is the source of truth.
