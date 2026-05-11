---
name: testing-patterns
description: slides-ng testing patterns — five iteration loops, when to reach for each, iframe-drilling helpers, and a placeholder for visual-regression in M5. Use when writing a new test, deciding which surface fits a behavior, or troubleshooting test infrastructure.
user_invocable: true
---

# slides-ng testing patterns

Five iteration loops. Each is fastest at validating a specific kind of
behavior; using the wrong one leaves you either flaky or slow. Pick the
fastest loop that actually catches the bug class you care about.

## Trigger phrases

- "write a test for…"
- "how should I test this?"
- "iteration is slow"
- "the WDIO smoke is failing"
- "/test-pattern"

## The five loops

| # | Loop | Speed | What it catches |
|---|---|---|---|
| 1 | **Unit watch** (`bun test --watch`) | ~50 ms/test | Pure-function correctness — parser AST, render-fragment HTML, frontmatter merging, slidev-syntax translations |
| 2 | **Auto-reload preview** (`bun run dev:reload`) | ~1–2 s | Plugin loads in real Obsidian + UI renders; the inner loop while iterating on view/commands/CSS |
| 3 | **Manual reload** (`bun run build && $OBS plugin:reload id=slides-ng`) | ~2–3 s | Same as #2 but explicit — when you don't want the watcher running |
| 4 | **E2E smoke** (`bun run e2e -- --spec test/e2e/smoke.spec.ts`) | ~15–25 s | Real Obsidian, real plugin, scripted — once per session and pre-commit |
| 5 | **E2E full + visual** (`bun run e2e`) | 1–3 min | Iframe DOM, slide count, fragment reveals, click-driven state, screenshot diffs (added in M5) |

## When to reach for each

### #1 Unit watch — `bun test --watch`

Default for any pure-function code. Mirror `src/<module>.ts` →
`tests/<module>.test.ts`. The renderer is testable in isolation: feed it
markdown, assert HTML.

**Examples (planned across M2-M7):**

- `parseDeck.test.ts` — markdown → AST shape, slide separators, vertical
  sub-slides, frontmatter extraction
- `renderDeck.test.ts` — AST → HTML; check `<section>` count, fragment
  attributes, code-block langs
- `vClick.test.ts` — `<v-click>` tag translation to `<span class="fragment">`
- `lineStep.test.ts` — `[1|2-3|all]` parsing + expansion into multi-pre
  reveal.js sections
- `magicMove.test.ts` — `{*|2-3|all}` step parsing for shiki-magic-move

**Don't reach here for:** anything that needs the Obsidian app object.

### #2 Auto-reload preview — `bun run dev:reload`

The inner loop you'll spend the most time in. `dev:reload` sets
`AUTORELOAD=1` which adds an esbuild `onEnd` hook that triggers
`plugin:reload id=slides-ng` after every successful rebuild.

Requires:

1. Obsidian 1.12+ running with the slides-ng vault open
2. Catalyst license (the `Obsidian.com` CLI redirector is Catalyst-only)
3. `OBSIDIAN_CLI` env var pointing at `Obsidian.com` if your install path
   differs from the default WSL2 path

Sequence:

1. Open this folder in Obsidian as a vault
2. Enable slides-ng in Settings → Community Plugins
3. In a terminal: `bun run dev:reload`
4. Edit `src/*.ts` → save → see the change in Obsidian in ~1–2 s

If the CLI isn't installed, fall back to `bun run dev` + manual
`$OBS plugin:reload id=slides-ng` when ready.

### #3 Manual reload — explicit one-shot rebuild

Use when you don't want a long-running watcher (e.g., before a commit
you want to keep the workspace quiescent).

```bash
bun run build
cp main.js styles.css manifest.json .obsidian/plugins/slides-ng/
$OBS vault=obsidian-slides-ng plugin:reload id=slides-ng
```

### #4 E2E smoke — `bun run e2e -- --spec test/e2e/smoke.spec.ts`

Real Obsidian via wdio-obsidian-service. The smoke spec proves the plugin
loads, the command registers, and the view opens.

Run this:

- Once per session before serious work (catches "I broke startup")
- Pre-commit
- In CI on every PR

`smoke.spec.ts` should stay fast and stable. Feature-specific specs go
into their own files: `render.spec.ts`, `v-click.spec.ts`, etc.

### #5 E2E full + visual — `bun run e2e`

Runs every spec under `test/e2e/`. For slides-ng, this includes:

- `smoke.spec.ts` — see #4
- `render.spec.ts` (M2) — open a deck file, switch into the iframe,
  assert slide count
- `v-click.spec.ts` (M4) — advance reveal.js, assert `.fragment.visible`
  count increases
- `line-step.spec.ts` (M5) — code-block line-stepping advances correctly
- `magic-move.spec.ts` (M5) — visual-regression baseline of magic-move
  frames (added when M5 lands)

## The iframe pattern

slides-ng's renderer mounts the deck inside an `<iframe srcdoc>`. WDIO
can't see iframe contents until you `switchFrame` into the iframe. The
helpers at `test/e2e/helpers/iframe.ts` centralize this:

```ts
import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";

it("renders 5 slides", async () => {
  await switchToSlideFrame();
  try {
    await waitForSlides(5);
    const count = await browser.execute(
      () => document.querySelectorAll(".reveal section").length
    );
    expect(count).toBeGreaterThanOrEqual(5);
  } finally {
    await switchToTop();
  }
});
```

**Always wrap the iframe-context body in `try { … } finally { switchToTop(); }`.**
Leaving the runner inside an iframe contaminates the next spec and
produces confusing "element not found" errors.

## Standing rule: visual features get WDIO + screenshots

Any feature that's visible to the user — view rendering, theme, layout,
animation, toolbar buttons, modal flows, anything pixels-affecting — ships
with at least one WebdriverIO spec under `test/e2e/` that:

1. Drives the feature end to end (open the view, advance a slide,
   click a button, …)
2. Asserts on the DOM where the feature manifests
3. Captures a `browser.saveScreenshot('./test-results/<name>.png')`

This is a hard rule, not a guideline. Unit tests on `renderDeck()`
output passed all 12 assertions for M2, but nobody had seen actual pixels
through the real Obsidian → iframe → reveal.js stack. That's not
"validated"; that's "compiled". Don't ship UX work without WDIO evidence.

Pure-logic deltas (parser refactor, internal type change, anything
invisible) don't need WDIO. The rule is about UX, not about test count.

### Screenshot workflow

```ts
import { switchToSlideFrame, switchToTop } from "./helpers/iframe";

it("renders the example deck with 6 slides", async () => {
  // Open the deck, run open-preview command, wait for iframe …
  await switchToSlideFrame();
  try {
    await waitForSlides(6);
    await browser.saveScreenshot("./test-results/m2-example-deck.png");
  } finally {
    await switchToTop();
  }
});
```

Screenshots go in `test-results/` (gitignored). They're not baselines yet
— just artifacts a reviewer (or future agent) can eyeball. The user
viewing the PR or branch can scroll through `test-results/` to confirm
the feature looks right.

### Visual regression (diffs against baselines) — added in M5

For features whose correctness IS visual fidelity — magic-move, auto-animate,
fragment animation — the screenshots become baselines and we diff:

1. After each animation keyframe, `browser.saveScreenshot(path)`
2. Store baselines in `test/e2e/baselines/`
3. Diff with `pixelmatch` or `resemblejs`
4. Threshold ~1% pixel difference (cursor/scrollbar position can shift)
5. Gate in CI with `--update-baselines` flag for intentional changes

Visual regression diffing is the M5 add-on. Every milestone before that
still captures screenshots — just doesn't auto-diff them.

## The cheap visual smoke — `bun run smoke:render`

Sometimes you want pixels-on-screen confidence without paying the full
WDIO + Obsidian boot cost (~3–5 min on first run, 30–60 s thereafter).

`bun run smoke:render` runs `scripts/render-example.mjs`, which feeds
`Decks/example.md` through `renderDeck()` and writes the resulting
iframe-srcdoc HTML to `test-results/example-deck.html`. Open that file
in any browser to visually inspect the renderer's output.

Trade-off: this proves the renderer + reveal.js stack works in a real
browser. It does NOT prove the Obsidian integration (iframe mounting,
sandbox attributes, view state, command registration). For those you
still need the WDIO spec.

Use both: smoke:render for the inner-loop "did I break rendering",
WDIO for the milestone-end "does it work in real Obsidian".

## Common pitfalls

- **WDIO timeout before plugin loads** — bump the `before` hook's timeout
  in your spec; Obsidian boot is slow on first run after a build
- **Iframe not found** — the helper relies on selector `iframe.slides-ng-frame`;
  if you rename the iframe class in `SlidesNGView.ts`, update the helper
- **Stale `main.js`** — `wdio.conf.mts` runs `bun run build` in `onPrepare`
  so this shouldn't happen, but if WDIO seems stuck on old behavior, kill
  the watcher and re-run
- **`plugin:reload` exits 1 with no output** — Obsidian probably isn't
  running; start it and retry
- **WDIO hangs at "Opening vault" in WSL2** — Electron + WSLg + chrome
  sandbox have known interaction issues. `wdio-obsidian-service` already
  passes `--no-sandbox` on Linux but Obsidian 1.5.x + electron 28 can
  still hang on first launch. Run `bun run e2e` from a Windows-native
  Obsidian/Node setup or use `bun run smoke:render` for renderer-only
  validation
