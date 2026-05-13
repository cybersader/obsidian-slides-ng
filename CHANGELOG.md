# Changelog

All notable changes to this project will be documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.7.3] — 2026-05-12

### Fixed

- **Grid button — content overflowing tiles** — v0.7.0/0.7.1/0.7.2
  tried to make reveal's stock overview behave with CSS overrides
  (aspect-ratio tiles, scale transform, clip-path). Real decks with
  images that exceed the slide width still overflowed horizontally
  no matter what. v0.7.3 abandons reveal's stock overview for the
  Grid button entirely and renders a **custom slides-picker
  overlay** instead: one text tile per slide showing number +
  title, click to jump, click outside or press Esc to close.
  Always-correct layout regardless of slide content. Reveal's
  stock overview is still reachable via the Esc keybinding for
  anyone who wants the pixel-perfect minis (with their bugs).

## [0.7.2] — 2026-05-12

### Fixed

- **Scene overlay newlines (round two)** — v0.7.1 made marked emit
  proper block elements (`<h1>`, `<p>`) for multi-line scene content,
  but the overlay's flex container used default `flex-direction: row`
  so the block children laid out horizontally as a single row. Now
  uses `flex-direction: column` so blocks stack vertically. Also
  added explicit `font-size: 2em`, `line-height: 1.4`, and `gap`
  between children so the overlay reads like a full-screen
  presentation slide rather than a tight inline blob.

## [0.7.1] — 2026-05-12

### Added

- **Namespaced frontmatter keys** — all deck/slide frontmatter keys
  now have a `slides-ng-` prefix to avoid collisions with other
  vault plugins. Renamed: `theme` → `slides-ng-theme`,
  `transition` → `slides-ng-transition`, `slideNumber` →
  `slides-ng-slide-number`, `transitionSpeed` →
  `slides-ng-transition-speed`, `customCSS` → `slides-ng-custom-css`,
  `layout` → `slides-ng-layout`, `image` → `slides-ng-image`.
  **Backward-compatible**: legacy unprefixed keys still work; the
  new prefixed key wins when both are present. Autocomplete
  recognises both forms.

### Fixed

- **Grid mode visual layout** — replaced the v0.7.0 CSS that
  collapsed into a row of squares in narrow viewports. Tiles now
  have a 960:700 aspect-ratio matching reveal's default slide
  dimensions, content scales to fit via CSS transform, no
  horizontal scrollbar, slide-number badge force-shown on every
  tile.
- **Scene markdown line breaks** — BRB and Q&A overlay defaults
  rendered without paragraph breaks because marked's default
  config collapses single `\n`. Switched the scene renderer to
  `{ breaks: true, gfm: true }` so multi-line scene content
  honours the line breaks the deck author wrote.
- **Menu toolbar button now actually toggles the menu** — the
  reveal-menu plugin's API surface varies (Reveal.toggleMenu vs
  RevealMenu.toggle). Now uses programmatic click on the
  `.slide-menu-button` DOM element first (most reliable), with
  Reveal.toggleMenu and RevealMenu.toggle as fallbacks.
- **Duplicate Blackout button removed** — Blackout is now exclusively
  accessed via the Scenes row (where it was duplicated against
  the util-group button); util-group keeps just the Grid action.
- **"Use current" focus-steal bug** (same root cause as the v0.5.4
  ribbon bug): toolbar click steals focus from the markdown view
  before the click handler runs. Now uses the plugin-level
  `lastMarkdownFile` tracker (via active-leaf-change) so the
  intended file is always found.
- **Speaker toolbar button styling** — toned down from the v0.7.0
  accent (mod-cta) treatment to match the rest of the toolbar.

### Changed

- **`bun run build`** now also syncs `main.js/manifest.json/styles.css`
  into `e2e-vault/.obsidian/plugins/slides-ng/`, so manual testing
  in the E2E sandbox vault picks up the latest build immediately
  (no need to copy by hand).

### Tests

- New `tests/frontmatter-prefix.test.ts` (13 tests): every renamed
  key + every legacy fallback + prefixed-wins-over-legacy when both
  set.
- Totals: 308 unit / 20 E2E spec files.

### Deferred to 0.8.0+

User feedback this session captured additional ideas that warrant
bigger work; tracked in `ROADMAP.md`:

- Compact picker mode redesign + clickable slide-N-of-M status label
- Editable speaker notes from the speaker view
- PDF export options (notes toggle / aspect ratio / pagination)
- Custom grid overview (if the v0.7.1 CSS-fix proves insufficient)
- DnD modular speaker panels (0.8.0 headline)

## [0.7.0] — 2026-05-12

### Added

- **Visual next-slide preview** in the speaker view — a second
  iframe pinned to slide N+1 of the same deck, theme + layouts +
  code highlighting + magic-move all rendered exactly as the main
  preview shows them. Sandbox stays `allow-scripts` only; synced via
  postMessage. Re-renders automatically when the deck file is saved.
- **Placeholder/scene slides** ("OBS-style scenes") — a library of
  overlay slides the presenter can flash up mid-presentation. Ships
  with 4 defaults (Blackout / Be right back / Q & A / Stand by); user
  adds + edits via the new Scenes section in settings. Speaker view
  shows a row of scene buttons; clicking activates an overlay on top
  of the current slide. Click again to clear. State protocol carries
  `activeSceneId` so the button + overlay stay synchronized.
- **Menu toolbar button** in the preview pane — toggles the
  reveal.js-menu hamburger so users don't have to hunt for it in the
  iframe corner. Hidden when `showRevealMenuEmbedded` is off.

### Fixed

- **"Grid" button rendered a single row, not a grid**: reveal.js's
  stock overview CSS collapsed in the embedded viewport, and there
  were no slide numbers. v0.7.0 adds dedicated `.reveal.overview
  .slides` CSS — proper auto-fill grid (180px minmax columns), scroll
  when content overflows, and a CSS-counter-driven slide-number badge
  on every tile so users can identify each one.
- **Speaker view buttons "kind of terrible"** — UI overhaul: every
  control now has an Obsidian icon via `setIcon`; nav buttons sit in
  a connected pill row; the Next button is a primary `mod-cta`
  accent; bigger tap targets; proper focus rings; labels collapse on
  narrow speaker leaves.
- **Mini-iframe state race**: speaker view's message handler now
  filters by `event.source` so state events from the visual next-
  slide preview iframe don't clobber the main preview's state.

### Changed

- **Bridge protocol** — new commands `setScene`, `clearScene`,
  `toggleMenu`. The existing `toggleBlackout` command remains as a
  backwards-compat alias for `setScene({id:'blackout', html:''})`.
- **Overlay element renamed**: `#slides-ng-blackout` → `#slides-ng-scene`
  (generic, holds any scene content). Style updated to flex-center +
  themed font.
- **`isBlackout` state field** derived from `activeSceneId ===
  'blackout'`; existing speaker views unaware of scenes still work.

### Tests

- New `tests/scenes.test.ts` (9 tests) — DEFAULT_SCENES shape +
  bridge command wiring + overview-mode CSS markers.
- New `test/e2e/speaker-070.spec.ts` (6 tests) — speaker button
  icons present; Next is `mod-cta`; Menu toolbar button exists; Grid
  triggers reveal overview AND `.slides` has grid display; scene
  toggle round-trip; mini-iframe has non-empty srcdoc.
- Totals: 295 unit / 20 E2E spec files.

### Notes

- DnD modular speaker panels + per-panel show/hide were in the
  original 0.7.0 plan; bumped to 0.8.0 to focus this release on the
  fixes the user surfaced this session.
- Hyperlinked slide-web navigation via Obsidian block IDs added to
  the idea jar (user-flagged but acknowledged as over-engineering;
  defer until requested).

## [0.6.0] — 2026-05-12

### Added

- **Per-slide background image / video** — `<!-- slide
  data-background-image="path" -->` (and `data-background-video`) now
  resolve vault-relative paths through the same `resolveImage`
  callback as the `image:` frontmatter, so attachments work the same
  way they do in image layouts. External URLs (`http(s)://`,
  `data:`, absolute paths) pass through unchanged.
- **Code-block max-height + internal scroll** — long fenced code
  blocks no longer overflow off slides. New settings
  `codeBlockMaxHeight` (default `"60vh"`, accepts any CSS length or
  `"none"`) and `codeBlockOverflowScroll` (default `true`).
- **`customCSS:` deck frontmatter** — inject arbitrary CSS rules into
  the iframe scoped to a single deck. Accepts a string or array of
  strings. Sanitization rejects any value containing `<` or `>` with
  a console warning (defense-in-depth — the iframe is sandboxed but
  the rejection prevents accidental script-tag breakouts within the
  emitted `<style>` block).
- **Reveal transition speed setting** —
  `transitionSpeed: "default" | "fast" | "slow"`. Also accepted as
  per-deck frontmatter. Passes through to `Reveal.initialize()`.
- **Magic-Move animation duration setting** —
  `magicMoveDurationMs` (default `500`, range 100–3000). Threaded
  into the iframe's bootstrap script so each token-morph render uses
  the configured duration.

### Fixed

- **Release workflow race** — `release.yml`'s old delete-and-recreate
  tag step caused `gh release create` to outrace the GitHub API after
  the re-push. Now: idempotent. The tag the user pushed is reused as-is
  (`git tag` / `git push` are no-ops if already present); if the
  release already exists from a prior run, the workflow uploads
  artifacts with `--clobber` instead of failing.

### Tests

- New `tests/backgroundImage.test.ts` (8 tests) — http pass-through,
  data:/file:/absolute pass-through, vault-relative resolution, video
  attr, missing resolver fallback, mixing with other slide attrs.
- New `tests/customCss.test.ts` (7 tests) — string + array forms,
  sanitization of `<`/`>`, mixed clean+dirty arrays.
- `tests/settings.test.ts` extended (+12 tests) — 0.6.0 defaults
  (codeBlockMaxHeight, codeBlockOverflowScroll, transitionSpeed,
  magicMoveDurationMs), threading into iframe srcdoc, headmatter
  overrides for customCSS + transitionSpeed.
- New `test/e2e/authoring-polish.spec.ts` (4 tests) — customCSS
  injected; data-background-image resolved or passed through; code-
  block max-height CSS rule present; magic-move duration literal in
  bootstrap.
- New fixtures `Decks/fixtures/16-slide-backgrounds.md` and
  `Decks/fixtures/17-custom-css.md` (copied to `e2e-vault/` too).
- Totals: 286 unit / 19 E2E spec files.

### Notes

- **More Shiki languages on-demand** is deferred indefinitely — the
  current static-import + sync `highlight()` contract would require
  a significant refactor to support runtime language loading, for
  marginal value (the 11 bundled langs cover ~95% of typical decks).
  Documented in ROADMAP.md.

## [0.5.4] — 2026-05-12

### Fixed

- **Ribbon "Open slides preview" button opened an empty/black preview**
  when a deck was loaded in the editor. The ribbon click was stealing
  focus from the markdown view BEFORE the callback ran, so
  `getActiveViewOfType(MarkdownView)` returned null and the preview
  loaded with no file. The command-palette path didn't show the bug
  because Obsidian preserves leaf context for command execution.

  Fix: track `lastMarkdownFile` via `active-leaf-change` events on
  plugin load (seeded from any currently active markdown view).
  `resolveActiveDeckFile()` falls back to the tracked file when the
  current active-view check returns null. Ribbon clicks now always
  open the user's most-recently-focused deck.

### Tests

- New `test/e2e/ribbon-focus.spec.ts` (1 test) — opens deck, defocuses
  via settings tab to force `getActiveViewOfType(MarkdownView)` →
  null, clicks ribbon DOM element, asserts preview opens on the right
  file AND iframe renders ≥ 2 slides.
- Totals: 259 unit / 18 E2E spec files.

## [0.5.3] — 2026-05-12

### Fixed

- **Toolbar overflow on narrow leaves**: when the preview pane was
  shrunk horizontally, buttons used to clip off the right edge with no
  way to reach them. Now the toolbar wraps when needed; the spacer
  collapses below 220 px; labels hide below 480 px; padding tightens
  below 220 px. Every button is reachable at any leaf width.

### Tests

- New `test/e2e/toolbar-narrow.spec.ts` (4 tests) — measures button
  bounding rects against the toolbar at 600 / 400 / 280 / 180 px
  widths; asserts every button is non-zero-width AND inside the
  toolbar's horizontal bounds.
- Totals: 256 unit / 17 E2E spec files.

## [0.5.2] — 2026-05-12

### Added

- **In-window reveal.js controls** — new setting
  `Show reveal controls in preview` (default off). When on, reveal's
  arrow + dot navigation UI and progress bar render inside the
  embedded preview iframe. Standalone "Open in browser" always shows
  them regardless.
- **reveal.js-menu plugin bundled** (~45 KB JS + ~8 KB CSS) — adds a
  hamburger button in the corner of the slide window. Click → outline
  by heading + jumpable slide list (closes the Extended-Slides parity
  gap on in-window discoverability). Setting:
  `Show menu plugin in preview` (default on).
- **"Grid" button in the speaker view** — posts a new
  `toggleOverview` bridge command to the iframe, triggering
  `Reveal.toggleOverview()`. Free thumbnail-style nav: reveal lays
  out every slide as a mini-grid; click one to jump.
- **6 new settings**, grouped in the settings tab under Rendering /
  Code / Layouts / Editor / Speaker sections:
  - `defaultLayout` — fallback layout when a slide has no `layout:` set
  - `codeTheme` — Shiki theme dropdown (github-dark, github-light, dracula, nord)
  - `imageLayoutSplit` — column ratio for image-left / image-right (50/50, 60/40, 40/60)
  - `lineStepDimOpacity` — opacity of non-active lines in code line-stepping (slider 0–1)
  - `speakerPickerDefaultMode` — initial picker mode for the speaker view (compact / list)
  - `speakerTimerTickMs` — timer refresh cadence (default 1000ms)
- **Bundled Shiki themes** — github-light, dracula, nord added
  alongside github-dark.

### Fixed

- **Slide-number click → black overlay**: with `hash:false` in
  embedded mode, the slide-number `<a>` click fell through into
  reveal's pause-mode toggle, blacking out the window. Now intercepted
  with a capture-phase click handler that `preventDefault`s the
  slide-number anchor.
- **Speaker Start/Pause button visual state**: label flips between
  "Start" and "Pause" with an accent (mod-cta) color when running.
  Previously the button worked but the timer's slow tick made it
  look unresponsive.
- **Speaker timer tick predictability**: ticks at the configured
  cadence (default 1Hz) instead of a hardcoded 500ms.

### Changed

- **Speaker picker default mode** persists from settings instead of
  resetting to "compact" on every reopen.
- **Code highlighting threading**: `renderDeck`, line-step renderer,
  and magic-move renderer now accept a `codeTheme` parameter and
  thread it through to Shiki + shiki-magic-move. Theme switch takes
  effect on next render.
- **main.js bundle**: 1.83 MB → 1.86 MB (added reveal.js-menu plugin
  + 3 extra Shiki themes; still under the 2 MB soft cap).

### Tests

- 17 new unit tests for settings (0.5.2 defaults, enums, renderDeck
  setting threading, slide-number suppressor, toggleOverview bridge
  command)
- New `test/e2e/in-window-controls.spec.ts` (4 tests) — toggles
  controls + menu settings and asserts iframe srcdoc reflects the
  change; visual confirmation that controls appear after re-render
- `test/e2e/speaker-view.spec.ts` extended (+2 tests) — Start/Pause
  visual state, Grid button → overview mode
- Totals: 256 unit tests / 16 E2E spec files

## [0.5.1] — 2026-05-12

### Added

- **"Use current" toolbar button** — explicitly load whichever
  markdown file you're focused on as the deck. Chosen over an
  auto-follow setting because the presenting flow often involves
  pulling up reference notes in other markdown tabs; the preview
  should stay locked to the deck unless you ask. Falls back with a
  "No Markdown file is focused." notice if nothing's active. If the
  focused file is already loaded, just refreshes.

### Tests

- New `test/e2e/use-current-file.spec.ts` (3 tests): initial load
  state, swap-on-click with iframe-content verification, notice path
  with no markdown focused
- Totals: 247 unit / 15 E2E spec files

## [0.5.0] — 2026-05-12

### Added

- **In-Obsidian Speaker Console** (`src/SlidesNGSpeakerView.ts`) — a new
  `ItemView` that drives the preview iframe via postMessage. Shows
  slide N / M, an elapsed timer (start/pause/reset), nav controls
  (first / prev / next / last), a blackout toggle, the current
  slide's speaker notes, a next-slide preview, and a slide picker
  with two modes (compact and full-list) the user can toggle. Open
  via the new toolbar "Speaker" button or the command palette
  (`Slides NG: open speaker view`). Opens as a horizontal split so
  preview + speaker are visible together; drag the tab to a new
  Obsidian window for a true second-monitor speaker console.
- **postMessage bridge in the iframe srcdoc** — inline script in
  `revealTemplate.ts` listens for `{type:'slides-ng-cmd', cmd,
  idx?}` (cmds: `next`, `prev`, `first`, `last`, `goto`,
  `toggleBlackout`, `requestState`) and emits
  `{type:'slides-ng-state', currentIdx, totalSlides, isBlackout,
  notesHtml, nextTitle, slides:[…]}` on `ready`, `slidechanged`, and
  fragment events. Sandbox stays at `allow-scripts` — no
  cross-origin loosening required.
- **Blackout overlay** — toggleable solid black `#slides-ng-blackout`
  div over the deck for "pause attention" moments during a talk.
- **Cursor-follow editor → preview** — when the markdown editor's
  cursor is in the deck file, the preview iframe jumps to the slide
  containing that cursor. Default on; togglable via
  `Settings → Slides NG → Editor → Follow cursor in editor`. Pure
  helper `slideIndexFromCursor` parses out `---` separators (skipping
  YAML frontmatter and fenced code blocks) and returns a 0-based
  slide index for any cursor line.
- **Toolbar polish** — preview-pane toolbar buttons are now icon +
  label with proper Obsidian-native styling. Speaker view button
  uses the accent (CTA) variant so it stands out. On narrow leaves
  the labels collapse and only icons remain. Tooltips on every
  button.

### Fixed

- **Scroll-mode auto-activation** — reveal.js 5 silently switched into
  scroll view in small embedded viewports, rearranging section DOM
  (`.slides > section` no longer matched) and making
  `Reveal.slide(idx)` scroll instead of jump. Now forced into
  presentation mode via `view: "presentation"` +
  `scrollActivationWidth: 0` in the iframe's `Reveal.initialize()`
  config. Discrete slide nav + speaker-view drive both work as
  expected.
- **Preview-leaf re-activation** — clicking the ribbon button while
  focused on the preview itself used to blank the deck because there
  was no active markdown file. Now retains the previously-loaded
  file when no markdown view is active.

### Tests

- 8 new unit tests for `slideIndexFromCursor` (frontmatter exclusion,
  code-fence exclusion, vertical-slide `--` handling, cursor past
  end-of-doc clamp)
- New `test/e2e/speaker-view.spec.ts` (6 tests): initial state
  arrival from iframe, Last button jumps to final slide, First
  button returns to opening slide, blackout toggle adds/removes
  iframe overlay div, picker mode toggles between compact and list
  with correct DOM emission, side-by-side screenshot
- Totals: 247 unit tests / 14 E2E spec files (was 239 / 13)

### Changed

- `harvestSlideMeta()` in the iframe bridge now uses a
  presentation-mode-robust selector — walks ancestors and excludes
  sections nested under another section — so vertical sub-slides
  don't leak into the speaker's slide picker regardless of which
  reveal view mode is active.

## [0.4.0] — 2026-05-12

### Added

- **Snippet/template expansion** — type `::name` at the start of a
  line in the slide body and the autocomplete dropdown surfaces
  matching templates alongside slot suggestions. Selecting a template
  replaces the entire `::name` with a multi-line markdown expansion
  (the `::` is summon-only — never part of the output). 15 built-ins:
  `note`, `cover`, `center`, `two-cols`, `two-cols-header`, `quote`,
  `statement`, `section`, `end`, `auto-animate`, `v-clicks`,
  `v-click`, `fragment`, `code-ts`, `code-step`.
- **Image layouts** — three new layouts: `image-left`, `image-right`,
  `image` (full-bleed). Image URL comes from per-slide frontmatter
  `image: path/to/file.png`. View resolves Obsidian-vault paths via
  `app.vault.adapter.getResourcePath()`; absolute URLs and `data:`
  URIs pass through. Wikilink-form (`[[attachment.png]]`) is also
  supported.
- **Magic-Move** — paired code blocks across consecutive slides
  sharing `{key=NAME}` (or `[key=NAME]`) get smooth token-morph
  transitions via `shiki-magic-move`. Token computation happens
  server-side (during `renderDeck`); the iframe srcdoc embeds a
  bundled vanilla `MagicMoveRenderer` + the keyed-token JSON in
  data-attrs; bootstrap script wires reveal.js's `slidechanged`
  events to morph between paired states.
- **Code-fence autocomplete safeguard** — `::` and `<v-` triggers now
  skip inside ```…``` and ~~~…~~~ blocks. Authors writing markdown
  code samples don't get the suggester popping up.
- **Fixture** `Decks/fixtures/15-magic-move.md` — three-step
  passphrase morph + a plain ts block + a single `key=other` block.

### Tests

- 18 new unit tests for templates (registry shape, cursor-offset
  computation, expansion contents)
- 9 new unit tests for `parseMagicMoveKey` (square + curly brackets,
  hyphenated keys, malformed input)
- 9 new unit tests for image layouts (applyLayout output, renderDeck
  integration, resolver fallbacks, URL passthrough, attribute escaping)
- 4 new unit tests for `isInsideCodeFence` (the autocomplete safeguard)
- New E2E spec `test/e2e/magic-move.spec.ts` (4 tests): marker emission,
  data-mm-key attrs, plain-ts non-wrapping, runtime presence
- Updated `tests/layouts.test.ts` to allow more than 9 layouts (we now
  ship 12 with the image layouts)
- Totals: 231 unit tests / 13 E2E spec files (was 192 / 12)

### Changed

- **First-render Shiki warmup** — `SlidesNGView.onOpen` now awaits
  Shiki warmup before the initial render so syntax highlighting AND
  magic-move keyed-token computation work on the first frame.
- **main.js bundle** — 1.77 MB → 1.81 MB (added the bundled
  `shiki-magic-move/renderer` + `core` runtime for the iframe; still
  91% of the 2 MB soft cap).

## [0.3.0] — 2026-05-11

### Added

- **Slide annotations** — Slides Extended / Slidev convention. Place
  `<!-- slide attr1="value" attr2 -->` anywhere in a slide and the
  attributes are merged onto that slide's `<section>` tag. Unlocks
  reveal.js's `data-auto-animate` (smooth element morphing between
  consecutive slides), per-slide CSS classes, custom `data-*` IDs.
- **Element annotations** — `<!-- element class="fragment" -->` placed
  immediately after an element folds those attributes into the element's
  opening tag. `class` and `style` values concatenate; everything else
  overwrites. Works for `<p>`, `<li>`, `<h*>`, `<blockquote>`, `<pre>`,
  etc.
- **Trailing-annotation recovery** — `@slidev/parser` pulls the last
  HTML comment in a slide into the speaker note. If that comment is
  actually a slide-or-element annotation (regex `^(slide|element)\s+`),
  `parseDeck` now re-injects it back into the slide content so the
  annotation pipeline can process it. Means `<!-- element class -->` on
  the last line of a slide still works.
- **Fixture** `Decks/fixtures/14-annotations.md` — auto-animate pair,
  fragment paragraphs, custom slide classes.
- **E2E spec** `test/e2e/annotations.spec.ts` — verifies `data-auto-animate`
  + custom classes + `.fragment` paragraphs all reach the iframe DOM.

### Tests

- 41 new unit tests for annotations (parseAttrString, extractSlideAttrs,
  applyElementAnnotations, mergeOpenTag, renderAttrs, edge cases for
  hyphenated attrs, bare attributes, multi-value styles, marker-mid-
  paragraph, no-preceding-element, nested elements, layout × annotation
  interactions, trailing-annotation recovery)
- 5 new E2E tests for the full pipeline in real Obsidian
- Totals: 192 unit tests / 12 E2E spec files (was 151 / 11)

## [0.2.1] — 2026-05-11

### Added

- **In-editor autocomplete** — three `EditorSuggest` classes registered
  on plugin load:
  - **LayoutNameSuggest** — type `layout: ` inside YAML frontmatter and
    a dropdown lists all 9 layouts with one-line descriptions.
  - **SlotMarkerSuggest** — type `::` at the start of a line in the
    slide body and the dropdown suggests the slot names for the
    current slide's layout (context-aware; e.g. inside a `two-cols`
    slide you get `left` and `right`). Falls back to all known slot
    names if no layout is set.
  - **VClickSuggest** — type `<v-` anywhere in the slide body and the
    dropdown suggests `<v-click>` / `<v-clicks>` with the matching
    closing tag.
- **Layout metadata registry** (`src/render/layoutSchemas.ts`) — single
  source of truth for the layout list, each layout's slot expectations,
  and one-line descriptions. The dispatch table in `layouts.ts` derives
  its `KNOWN_LAYOUTS` from this; the autocomplete suggesters read from
  it; render-time validation reads from it. A unit test enforces that
  the dispatch table and the schema list stay aligned.
- **Render-time validation** — `applyLayout` now warns via `console.warn`
  when a required slot is missing or whitespace-only. Rendering still
  proceeds with empty placeholders. Users see the hint in Obsidian's
  dev console (Ctrl-Shift-I) instead of being confused by a silently
  blank column.

### Fixed

- **Stale-dev-vault footgun** — opening the repo as an Obsidian vault
  used to load whichever stale `main.js` happened to be in
  `.obsidian/plugins/slides-ng/` (often M2-era 482 KB from before Shiki
  / layouts were bundled). `bun run build` now syncs `main.js`,
  `manifest.json`, and `styles.css` into that folder automatically, so
  the repo's own vault always reflects the latest build.

### Tests

- 9 new unit tests for `LAYOUT_SCHEMAS` consistency (registry ↔
  dispatch table alignment, schemaFor, ALL_KNOWN_SLOTS)
- 6 new unit tests for validation warnings on missing required slots
- 11 new unit tests for the suggester helpers
  (`parseAllFrontmatterBlocks`, `isInFrontmatter`, `currentSlideLayout`)
- New `test/e2e/autocomplete.spec.ts` (7 tests) — verifies suggesters
  register and `onTrigger` fires correctly in real Obsidian for each
  context (frontmatter `layout:`, slide-body `::`, slide-body `<v-`)
- Totals: 151 unit tests / 11 E2E spec files (was 129 / 10)

## [0.2.0] — 2026-05-11

### Added

- **Slidev-style layouts** — `layout:` per-slide frontmatter selects from
  9 bundled layouts:
  - `default` — single column (the v0.1 behaviour, now formally a layout)
  - `center` — content vertically + horizontally centered
  - `cover` — title-slide style, larger type, centered
  - `two-cols` — left + right columns via `::left::` / `::right::` slot markers
  - `two-cols-header` — header on top, two columns below
  - `quote` — large blockquote styling
  - `statement` — single emphasised statement
  - `section` — chapter-divider style
  - `end` — closing-slide style
- **Slot splitter** (`src/render/slots.ts`) — `::name::` markers on their
  own line partition slide content into named slots. The default slot is
  everything before the first marker.
- Each slot's markdown is rendered independently, so `<v-clicks>` inside
  `::left::` stays scoped to that column (no fragment bleed into
  `::right::`).
- Image layouts (`image-left`, `image-right`, `image`) are intentionally
  deferred to v0.2.x — they need Obsidian attachment-path resolution that
  has its own scope.

### Tests

- 10 new slot-splitter unit tests
- 16 new layout dispatch + end-to-end unit tests
- New `test/e2e/layouts.spec.ts` (4 tests + 8 per-layout screenshots)
- New fixture `Decks/fixtures/13-layouts.md` covering all 9 layouts
- Totals: 145 unit tests / 10 E2E spec files (was 102 / 9)

## [0.1.0] — 2026-05-11

First public release. Every milestone (M1 through M8) of the brief's
v0.1 plan is implemented + tested.

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
- M7 themes + settings + PDF print + speaker view:
  - **Themes:** bundled all 15 reveal.js themes that ship in
    `node_modules/reveal.js/dist/theme/` (black, white, simple, league,
    beige, sky, night, serif, solarized, blood, moon, dracula,
    black-contrast, white-contrast, …). The generator script
    auto-discovers them so future reveal upgrades pick up new themes
    for free. `availableThemes()` lists them; `getTheme()` resolves
    by name with a `black` fallback for unknown values.
  - **Settings tab:** `src/SlidesNGSettingTab.ts` with dropdowns for
    Default theme + Default transition. Persisted via Plugin
    loadData/saveData. Settings resolve in priority order: programmatic
    overrides (e.g. `embedded:false` for standalone) → per-deck
    frontmatter → plugin settings → revealTemplate built-in defaults.
  - **Empty frontmatter fix:** `headmatterToOptions` was returning
    `{ transition: undefined }` for empty frontmatter which silently
    overrode plugin defaults during the layered merge. Switched to a
    partial object that only contains keys actually present in the
    frontmatter.
  - **PDF print mode:** new `slides-ng:export-for-pdf` command +
    "Export for PDF" toolbar button. Same export path as
    open-in-browser, but appends `?print-pdf` to the
    `electron.shell.openExternal` URL. Reveal.js detects the query
    string and renders one slide per page for browser-side
    Print → Save as PDF.
  - **Speaker view:** already works (M2 parses notes into
    `<aside class="notes">`, M6's `embedded:false` enables reveal.js's
    speaker-view plugin). User presses S in the standalone-export
    browser tab to open a popup with notes, timer, and next-slide
    preview. No new code needed.
  - 9 new unit tests (settings + theme resolution + transition
    constants); 5 new E2E tests (settings tab renders both controls,
    captures screenshot, persistence flows into render, export-for-pdf
    command registered + writes self-contained HTML).
  - main.js: 1.64 MB → 1.75 MB (15 themes vs 3); still under 2 MB cap.
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
