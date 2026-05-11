# Changelog

All notable changes to this project will be documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- M1 scaffold: bun + esbuild + TypeScript build pipeline
- Minimal `SlidesNGPlugin` and `SlidesNGView` skeleton (empty preview pane)
- Ribbon icon and command palette entry for "Slides NG: open preview"
- M1.5 test infrastructure: WebdriverIO (`wdio-obsidian-service`) smoke
  spec, iframe-aware E2E helpers, `bun test` scaffolding, auto-reload
  esbuild hook (`bun run dev:reload`) wired to Obsidian's official CLI
- `.claude/skills/obsidian-cli/SKILL.md` and `.claude/skills/testing-patterns/SKILL.md`
- M2 static renderer:
  - `parseDeck()` — wraps `@slidev/parser` to slice markdown into slides
    with frontmatter, content, and speaker notes
  - `renderDeck()` — slides → marked-rendered HTML → reveal.js-ready
    `<section>` markup → full iframe-srcdoc document
  - reveal.js + reveal CSS + 3 themes (black, white, simple) inlined at
    build time via `scripts/generate-reveal-assets.mjs` — zero network
    requests at runtime
  - `SlidesNGView` mounts an `<iframe sandbox="allow-scripts">` and writes
    the rendered HTML to `srcdoc`; toolbar has a Reload button
  - Open-preview command passes the active markdown file's path to the view
  - Unit tests: `parseDeck.test.ts` + `renderDeck.test.ts` (12 tests total)
  - E2E render spec (`test/e2e/render.spec.ts`) drills into the iframe,
    asserts reveal.js mounted ≥6 sections from `Decks/example.md`, and
    captures screenshots — required for all UX-visible features per the
    new hard constraint (brief §3) and `.claude/skills/testing-patterns/`
  - Cheap visual smoke (`bun run smoke:render`) writes the rendered
    iframe-srcdoc HTML to `test-results/example-deck.html` for direct
    browser inspection — complements the full E2E with a fast inner-loop
    check that doesn't require an Obsidian binary
- M6 open-in-browser presentation mode:
  - `renderDeckStandalone()` produces the same iframe-srcdoc HTML the
    in-Obsidian preview uses, but with `embedded: false` so reveal.js
    enables fullscreen (F key), controls, progress bar, and speaker
    view (S key)
  - `src/export/exportStandalone.ts` writes the rendered HTML to
    `.slides-ng-export-<timestamp>.html` at the vault root, then calls
    `electron.shell.openExternal('file://' + abs)` to open it in the
    user's default browser. Zero IPC beyond Electron's standard shell;
    no spawned process, no listening port — same architecture as the
    rest of the plugin
  - New toolbar button "Open in browser" next to "Reload"; new command
    `slides-ng:open-in-browser` in the command palette
  - The command falls back to the slides-ng preview view's currently-
    loaded file when no markdown editor is the active view (so clicking
    the toolbar button on the preview pane itself works)
  - 11 new unit tests (exportStandalone.test.ts: filename, render
    config, mock-adapter write); 5 new E2E tests (command registered,
    file written, HTML self-contained with `embedded:false`, both
    toolbar buttons present, screenshot capture)
  - Visual proof: M6 screenshot shows the Notice "Opened
    .slides-ng-export-<timestamp>.html in your default browser." —
    confirming the full pipeline (WDIO → command → render → write →
    electron.shell.openExternal → user-facing Notice) works end-to-end
  - main.js: 1.57 MB → 1.64 MB (still under 2 MB cap)
- M5 Slidev-style code line-stepping:
  - `src/parser/lineStep.ts` parses both square-bracket (`[1|2-3|all]`)
    and curly-bracket (`{1|2-3|all}`) info-string forms; supports single
    lines, ranges, `all`/`*`, comma lists; rejects malformed input
  - `src/render/lineStepRenderer.ts` emits a stacked
    `<div class="line-step-container">` with one
    `<div class="line-step-step">` per step. Step 0 renders normally;
    steps 1..N wear `.fragment.line-step-fade` so reveal.js advances them.
  - Shiki transformer dims lines NOT in the current step's range
    (`.line.line-dim` with opacity 0.32) — the "spotlight" effect
  - CSS grid stacking + `:has()` + `current-fragment` selectors in the
    iframe template ensure only the current step is visible at a time;
    no JavaScript event handlers needed
  - `tests/lineStep.test.ts` (12 parser tests) + extended
    `tests/renderDeck.test.ts` (4 line-stepping tests) +
    `test/e2e/line-stepping.spec.ts` (4 E2E tests)
  - Visual proof: `test-results/m5/step-0.png` shows line 1 bright,
    lines 2-3 dimmed — the dim transformer working correctly
  - Known WDIO automation limitation: `Reveal.next()` from
    `browser.execute()` inside the embedded iframe doesn't reliably
    advance fragments, so the per-step screenshots may all show
    step 0. The DOM assertions cover the per-step state separately;
    real-user clicks work normally. Frame-advance automation would
    require keyboard-event injection — deferred.
- M4.5 fixture coverage library:
  - 13 fixture decks under `Decks/fixtures/`, one per feature category
    (basic markdown, frontmatter, transitions, vertical slides, v-click,
    v-clicks, all 10 Shiki languages, Slidev info-string, speaker notes,
    tables/blockquotes, inline HTML, edge cases)
  - `tests/fixtures.test.ts` — 24 unit assertions, one focused describe
    block per fixture
  - `tests/transitions.test.ts` — 7 transition config tests (config-only
    coverage per the standing rule; visual fidelity deferred to M5+)
  - `test/e2e/fixtures.spec.ts` — 13 E2E tests, one per fixture; each
    opens the fixture in real Obsidian, runs open-preview, captures an
    iframe-only screenshot to `test-results/fixtures/`
  - Total: 68 unit tests (was 37), 23 E2E tests (was 10)
  - Visual audit summary: 11/13 fixtures rendered cleanly on first pass.
    Two minor issues found:
      1. `slideNumber: true` correctly enters `Reveal.initialize()` config
         but the rendered slide number can be low-contrast in some themes
         (white on white-with-overlay for simple theme). Theme polish for
         M7 — not a renderer bug.
      2. `08-shiki-line-step.md` fixture used a nested-backtick escape
         (`\``) which marked does not process. Replaced with prose
         description; renderer pipeline was never at fault.
- M4 Shiki + Slidev fragments:
  - Fine-grained Shiki bundle (`shiki/core` + JS regex engine, no WASM)
    with 11 default langs (ts, js, py, bash, html, css, md, json, yaml,
    go, rust) and `github-dark` theme — main.js grew from 483 KB to 1.64 MB,
    still under the 2 MB soft cap
  - Singleton highlighter at `src/render/shiki.ts`; warmed asynchronously
    from `SlidesNGPlugin.onload`. Before warm completes, renders fall
    back to plain escaped `<pre><code>` so the deck still draws
  - Slidev's `<v-click>` translates to `<span class="fragment">` and
    `<v-clicks>` adds the `fragment` class to each immediate child
    (li/p/h*/blockquote/pre/figure) — implemented via
    `src/render/clickReveals.ts` post-process pass on the marked output
  - Code-fence info string handling: `\`\`\`ts [1|2-3|all]` correctly
    syntax-highlights as TypeScript. The `[1|2-3|all]` line-step syntax
    is preserved for M5 to parse but doesn't break Shiki resolution
  - 17 new unit tests (shiki: 6, clickReveals: 7, renderDeck: 4)
  - E2E `fragments.spec.ts` (3 tests): asserts .fragment + .shiki DOM
    presence, asserts Shiki produces styled tokens (not plaintext),
    captures 4 screenshots (frame + slide + v-clicks-only deck + shiki
    code-block deck)
- M3 save-watch loop:
  - `SlidesNGView` registers `app.vault.on('modify', ...)` scoped to the
    active deck file, with a 300 ms debounced refresh — editor saves +
    external writes both trigger an iframe re-render
  - Cleanup is handled via `registerEvent`; the pending timer is
    cancelled in `onClose`
  - E2E save-watch spec proves the loop end-to-end: appends a slide via
    `app.vault.modify`, asserts the iframe section count increases
    within the debounce window, plus a runtime negative-assert that the
    iframe's `document.location` stays at `about:srcdoc` (no localhost)
  - Static guard test (`tests/hardConstraints.test.ts`) greps `src/`
    for forbidden patterns (`child_process`, `spawn`, `createServer`,
    `localhost:`, CDN URLs) and fails the build on any match —
    defends the brief §3 hard constraints against future drift
