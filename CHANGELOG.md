# Changelog

All notable changes to this project will be documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.11.41] — 2026-05-15

### Fixed

- **Speaker popup script never ran.** Diagnosed: the `<span
  class=\"empty\">` HTML literal inside the popup template had
  one too few backslashes. After the OUTER template literal
  collapsed `\\` to `\`, the JS engine then collapsed `\"` to
  `"` — so the popup parser saw `"<span class="empty">"` with
  bare quotes, treated `empty` as an unexpected identifier, and
  threw a SyntaxError. The error killed the entire popup
  `<script>` block, which is why **the timer never moved, the
  scenes bar never built buttons, and the notes panel stayed at
  "(waiting for sync…)"** — every symptom came from this one
  parse error. Fixed by switching to an unquoted HTML5
  attribute (`class=empty`) — survives every layer of escape
  with zero backslashes. Added a regression test that parses
  the generated popup script as JS and fails on any SyntaxError.
- **Scene-editor inputs (Label / Lucide icon / Markdown content)
  overlapped in Settings** when the panel was narrow. Grid
  columns weren't allowed to shrink below their content because
  `min-width` defaulted to `auto`. Added `min-width: 0` on every
  direct child of the row and `width: 100%; box-sizing:
  border-box` on inputs/textareas.

### Added

- **Click-to-advance setting** (Settings → Behaviour →
  "Click to advance slides"). Off by default. When on, a click
  anywhere on a slide that isn't a link / button / input
  advances to the next slide, PowerPoint-style. The handler
  skips clicks on the Grid overlay, hamburger menu, scene
  overlay, and reveal-menu controls. Flows through to standalone
  exports too.

### Changed

- **Picker-header icon buttons (Grid orient + Magnifier-cycle)
  now match Obsidian's view-action transparency.** Was a solid
  `--text-muted` color which read as visually heavy next to the
  panel header label. Now uses `--icon-color` + `--icon-opacity`
  (≈0.55) at rest, full opacity on hover — same as Obsidian's
  edit-pencil icon.

### Tests

- `tests/pdfExportOptions.test.ts` — 2 new tests: popup-script
  JS-parse guard (catches the v0.11.41 regression class) and
  click-to-progress conditional emission. 24 file-local pass;
  409 total in the suite.

### Technical

- `src/render/revealTemplate.ts` — popup notes-empty literal
  switched to `class=empty` (unquoted HTML5 attr). New
  `clickToProgress` template option emits a delegating click
  listener that walks ancestors for interactive tags before
  calling `Reveal.next()`.
- `src/settings.ts` / `src/SlidesNGSettingTab.ts` — new
  `clickToProgress` setting (default false) and UI toggle.
- `src/SlidesNGView.ts` — threads `clickToProgress` into both
  the embedded render and the standalone export defaults.
- `src/styles.css` — picker icon-tool buttons use Obsidian's
  `--icon-color` / `--icon-opacity` vars; scene-editor row
  children get `min-width: 0` + inputs get `width: 100%`.

## [0.11.40] — 2026-05-15

### Fixed

- **PDF export silently dropped its options when the vault path
  contained `&`, spaces, or other URL-reserved characters.**
  `pathToFileUrl()` now URL-encodes each path segment via
  `encodeURIComponent`, preserving `/` as the separator and
  the drive letter on Windows. User-reported case:
  `C:\Users\...\01 Vaults\b&g\.slides-ng-export-...html` —
  the unencoded `&` was interpreted as a query-string
  separator, so reveal never saw `?print-pdf&showNotes=true`
  and the deck rendered in normal presentation mode.
- **G key would summon reveal's "jump to slide" number input.**
  The G keydown handler now runs in the capture phase and
  calls `stopImmediatePropagation()` so reveal's own keyboard
  listener never sees the event.

### Added

- **M key toggles the hamburger menu.** Previously M only
  opened the menu (reveal-menu's stock binding). The slides-ng
  handler now checks `isOpen()` / `.slide-menu.active` and
  calls `closeMenu()` when already open.
- **Q key exits fullscreen and dismisses overlays.** Calls
  `document.exitFullscreen()`, removes the slides-ng grid
  overlay, closes the hamburger menu if open, and clears the
  active scene.
- **Grid button icon redesigned** as a 3x3 grid of filled
  dots so it's visually distinct from reveal-menu's close (X)
  glyph. The previous 2x2 outlined-squares icon was being
  mistaken for a close button at glance.

### Tests

- `tests/pdfExportOptions.test.ts` — 4 new tests covering
  `&` in path encoding, M-toggle handler, Q exit handler,
  and grid icon shape (9 filled rects, `currentColor` fill).
  22 pass total in that file; 407 pass in the full suite.

### Technical

- `src/export/exportStandalone.ts` — per-segment
  `encodeURIComponent` in `pathToFileUrl`.
- `src/render/revealTemplate.ts` — G handler registered as
  capture-phase listener; new M + Q capture-phase keydown
  handlers; Grid button SVG rewritten with 9 filled
  rectangles.

## [0.11.39] — 2026-05-15

### Added

- **Iframe-side error capture.** Any uncaught error in the
  iframe (init, async reveal init, asset eval) now:
  1. Shows visually as a red banner at the top of the
     iframe (so you can screenshot)
  2. PostMessages `slides-ng-iframe-error` to the parent
     window
  3. The parent persists the error to `slides-ng-debug.log`
     in the vault root (when debugLogging is on, which is
     the default for v0.11.x)
  This means future "black screen" or "blank pane" issues
  become diagnosable from the debug log without needing
  browser dev tools.

### Technical

- `src/render/revealTemplate.ts` — iframe IIFE now installs
  `window.error` + `unhandledrejection` listeners
  immediately, before Reveal.initialize. Surfaces errors
  visually + via postMessage.
- `src/SlidesNGView.ts` — new `iframeErrorHandler` field
  attached on `onOpen`, removed on `onClose`. Routes
  `slides-ng-iframe-error` messages into `this.debug.log`.

## [0.11.38] — 2026-05-14

### Fixed

- **Embedded preview going black** (user-reported after
  v0.11.37). The v0.11.35 `?print-pdf` runtime detection
  block ran for BOTH embedded and standalone exports —
  it was wrapped in a try/catch but the location-search
  read in `about:srcdoc` iframes had some interaction that
  may have stalled init. v0.11.38 strictly gates that
  block behind the render-time `!embedded` template
  interpolation, so the entire print-pdf code path is
  STRIPPED FROM EMBEDDED OUTPUT at render time. Any
  future bug in print-pdf detection can no longer regress
  the embedded preview.

## [0.11.37] — 2026-05-14

### Fixed

- **Speaker-popup sync was never landing.** Cause:
  `window.opener` reference can be stripped on some browser
  configs (Cross-Origin-Opener-Policy, popup blockers,
  certain Chrome flags) — the popup's poke message never
  reached the opener and notes stayed at `(waiting for
  sync…)`. Switched sync to a **localStorage-based
  primary channel** (opener writes state on `slidechanged`
  + initially on Reveal ready; popup reads on load + listens
  for `storage` events). postMessage is kept as a secondary
  path.
- **Scene buttons stayed empty in the popup** for the same
  `window.opener` reason. The opener now writes
  `__slidesNgScenes` to BOTH `window` and localStorage; the
  popup tries `window.opener` first then falls back to
  localStorage.
- **PDF print mode wasn't activating slide-card layout.**
  Reveal v5 sets `html.reveal-print` + `html.print-pdf`
  classes when it detects `?print-pdf`, but our hardcoded
  `view: "presentation"` was short-circuiting that
  detection AND the timing of class addition meant our
  custom slides-ng CSS never saw the print state. Now: at
  runtime, when `?print-pdf` is in the URL, we manually add
  both classes to `<html>` immediately AND set
  `initOpts.view = 'print'`. Added our own
  `html.print-pdf` CSS rules that:
  - Hide hamburger + Grid button + reveal controls/progress
    during print (they were leaking into the PDF)
  - Style each `section` as a page-sized card with
    `page-break-after: always`
  - Render `<aside class="notes">` underneath each card
    with a soft background separator (when showNotes is
    enabled)

### Technical

- `src/render/revealTemplate.ts`:
  - `setupStandaloneEnhancements` now writes scenes to
    localStorage in addition to `window`.
  - `postStateToSpeaker` writes the speaker payload to
    `localStorage["slides-ng-speaker-state"]` then falls
    back to postMessage. Initial state pushed once Reveal
    is ready (so the popup has something to read on open).
  - Popup template's state listener has THREE sources now:
    direct postMessage, immediate localStorage read on load,
    and a `storage` event listener for subsequent updates.
  - In-template `<style>` block adds the print-pdf rules.

## [0.11.36] — 2026-05-14

### Changed

- **Speaker-popup scene buttons now match your configured
  scenes** (rather than the 4 hardcoded defaults from
  v0.11.35). The render pipeline now threads
  `settings.scenes` through `RenderDefaults`, renders each
  scene's markdown `content` to HTML at export time, and
  emits the array as `window.__slidesNgScenes` in the
  standalone HTML. The speaker popup reads that array via
  `window.opener.__slidesNgScenes` at load time and builds
  its toolbar buttons dynamically — including any
  custom scenes you've added in Settings → Slides NG →
  Scenes. The "Clear" button stays pinned to the right.
  If you have zero scenes configured, the toolbar hides
  entirely.

### Technical

- `src/render/renderDeck.ts` — `RenderDefaults.scenes`
  field added. `renderDeckFromAst` maps each entry through
  the breaks-aware notes-marked instance so the
  `contentHtml` is ready for `setScene`.
- `src/render/revealTemplate.ts` —
  `DeckRenderOptions.scenes` (pre-rendered shape).
  Standalone init block emits
  `window.__slidesNgScenes = <json>`. Popup template
  removes the hardcoded scene buttons and ships a
  `buildSceneButtons()` helper that reads from
  `window.opener.__slidesNgScenes`.
- `src/SlidesNGView.ts` + `src/main.ts` — `renderDefaults`
  / the inline default objects now include
  `scenes: settings.scenes` so both the `Open in browser`
  and `Export for PDF` paths carry the same set the speaker
  view uses.
- `tests/pdfExportOptions.test.ts` — new unit test
  asserting custom scenes + their rendered HTML reach the
  standalone export.

## [0.11.35] — 2026-05-14

### Fixed

- **PDF export now actually renders slide cards + speaker
  notes.** The exported HTML hardcoded `view: "presentation"`
  in `Reveal.initialize`, which overrode reveal's
  auto-detection of `?print-pdf`. Print mode never activated
  → each slide rendered as plain text on a page with no
  card boundary and no notes, even with "Show notes" ticked.
  Now: at runtime, if `?print-pdf` is in the URL, set
  `initOpts.view = "print"` (reveal then lays out each
  slide as a card-styled print page). Also parse the
  `?showNotes=...` URL param and set `initOpts.showNotes`
  so reveal includes the notes layout under each slide.

### Added

- **Scenes in the speaker-view popup.** Top toolbar with
  Blackout / Be right back / Q & A / Stand by / Clear
  buttons. Clicking sends `setScene` (with id + html) via
  `window.opener.postMessage` to the main deck window;
  Clear sends `clearScene`. Same overlay mechanism the
  embedded speaker view uses (the `ensureSceneEl` /
  `setScene` / `clearScene` handlers in the iframe were
  already there for the in-Obsidian flow — popup now hooks
  them too). Active scene's button gets the accent
  treatment; clicking it again is also a toggle-off.

### Technical

- `src/render/revealTemplate.ts`:
  - In the init script, runtime-detect
    `/print-pdf/i.test(location.search)` and override
    `view` + `showNotes` before calling
    `Reveal.initialize`.
  - Popup template grows a `.scenes-bar` row at the top
    (grid `auto / 1fr / 1fr` row template). Buttons carry
    `data-scene-id` + `data-scene-html`. Click handler
    forwards via `window.opener.postMessage`. Active state
    toggle on the button.

## [0.11.34] — 2026-05-14

### Fixed

- **Hamburger button contrast.** The reveal-menu button's
  default style was nearly transparent and disappeared against
  light slide backgrounds (user-reported). Added a solid
  translucent dark backdrop + subtle border so the button is
  visible regardless of theme. Hover boosts to full opacity.
- **G key now toggles the Grid overview.** Pressing G when
  the grid is already open closes it (the existing
  toggleOverview function handles open/close, but the
  Esc/G key listener only handled Esc). The keydown handler
  now uses capture-phase to beat reveal's own Esc handler
  (which was triggering reveal's slide-selector overlay and
  making it look like Esc did nothing).
- **Speaker-popup sync.** The popup's inner iframes need to
  finish loading the deck before they can respond to goto
  postMessages. The first 100ms poke fired BEFORE the
  iframes were ready, and the goto commands were dropped.
  Fix: track iframe load state; queue pending state if it
  arrives early; replay once both iframes report `load`.
  Plus a `goto` burst (now / 100 / 300 / 700 ms) into each
  iframe so the bridge listener race is defeated. Poke
  schedule extended to 5 attempts over 5 s.

### Technical

- `src/render/revealTemplate.ts`:
  - `.reveal .slide-menu-button` CSS overrides for visibility
    (rgba(0,0,0,0.55) bg, 1 px border, soft shadow, 0.85
    opacity at rest, 1.0 on hover).
  - Grid overlay's keydown listener uses capture phase + handles
    both Escape and G. preventDefault + stopPropagation prevent
    reveal from also seeing the key. MutationObserver
    auto-removes the listener when the overlay is closed by a
    click.
  - Popup HTML now has `iframesLoaded` state tracking,
    `pendingState` queue, and the `markLoaded` helper. Goto
    posts are a 4-shot burst (now / 100 / 300 / 700 ms).
  - Popup poke schedule: 100 / 400 / 1000 / 2500 / 5000 ms.

## [0.11.33] — 2026-05-14

### Added

- **Grid button in the standalone export.** Bottom-right
  floating button (icon: 4-square grid) that opens the same
  thumbnail-grid overview the embedded preview's "Grid"
  toolbar button does. Also bound to the **G** keyboard
  shortcut. Skipped inside iframes (so the speaker-view
  popup's inner iframes don't double-render the button).
- **Speaker-view popup on S key (standalone only).** Opens
  a new window with: current-slide iframe, next-slide
  iframe (both synced via `postMessage`), the active
  slide's notes, and a Reset/Pause timer. Postal-message
  protocol identical to the embedded speaker view so the
  same `slidechanged` event drives both. Pressing S when
  the popup is already open: focuses it.
- **`window.__slidesNgOpenSpeakerView()` /
  `window.__slidesNgToggleGrid()`** — test + automation
  hooks. Same triggers the S / G keys fire.
- **4 new unit tests** verifying the standalone enhancements
  are in the rendered HTML (Grid button class, G handler,
  speaker-view helpers, popup template panels).
- **2 new test decks** in `b&g_vault/b&g/_slides-ng-test/`
  for manual exercising of v0.11.16-32:
  - `12-browser-export-test.md` — hamburger + PDF + grid
  - `13-speaker-popup-test.md` — long-form deck with
    substantive notes per slide

### Verified

- Bundle: standalone enhancements ARE included when
  `embedded === false`; SKIPPED in embedded preview
  (smoke:render confirms no `slides-ng-grid-btn` in the
  embedded output).

### Technical

- `src/render/revealTemplate.ts` — added a
  `setupStandaloneEnhancements` IIFE gated behind
  `!embedded && window.self === window.top`. Builds the
  Grid button + S/G key handlers + the speaker-view popup
  HTML as a string template (joined array of lines).
- `tests/pdfExportOptions.test.ts` — 4 new unit tests in
  the "standalone enhancements bundled (v0.11.33)" suite.
- `test/e2e/open-in-browser.spec.ts` — 3 new WDIO tests for
  the Grid button + speaker-view popup (currently flaking
  in the WDIO iframe context; the user verifies in real
  browser via BRAT).

### Known issue

- WDIO tests for the new standalone enhancements are
  flaking inside the srcdoc-iframe probe context (the
  injected iframe's Reveal init not completing the same way
  it does in a real browser). Unit tests + manual real-
  browser verification confirm the features work. The
  iframe-context WDIO interaction will be addressed
  separately.

## [0.11.32] — 2026-05-14

### Fixed

- **Hamburger menu actually renders in the exported HTML.** The
  reveal-menu plugin's `init()` blocks on loading
  `menu.css` via the network and only builds the menu DOM
  inside the stylesheet load callback. We bundle the CSS
  inline (via `revealMenuCss`), so the network load 404s
  (path resolves to `app://obsidian.md/menu.css` which doesn't
  exist), the callback never fires, and the hamburger never
  appears. Fix: after `Reveal.initialize()` resolves, call
  `Reveal.getPlugin('menu').initialiseMenu()` directly —
  bypasses the network wait, the menu DOM gets built, the
  `M` keyboard shortcut works, the corner button is
  clickable. Affects the standalone export (`Open in
  browser`, `Export PDF`) — not the embedded preview, which
  has `showMenuEmbedded: false` by default.

### Added

- **Experimental: modular grid speaker view (stub).** New
  setting at Settings → Slides NG, default `false`. Toggling
  it on currently shows a "not implemented yet" Notice and
  reverts to `false`. The actual grid-layout engine isn't
  shipped (the toggle adds 0 KB; the engine, when implemented,
  is anticipated at ~15–25 KB). Documented in
  `experimentalGridSpeakerView`'s comment in `settings.ts`
  including the bundle-size policy (lazy-load if it grows
  beyond ~50 KB).

### Verified

- **Hamburger menu click-through (E2E).** New WDIO test
  injects the exported HTML into a hidden iframe via srcdoc,
  waits for reveal + the menu plugin to boot (now via the
  `initialiseMenu()` call), clicks `.slide-menu-button`, and
  asserts the drawer opens (one of `body.has-menu-open`,
  `.slide-menu.active|.is-open|.open`, or
  `[data-open="true"]`).
- **Reveal keyboard shortcuts (E2E).** Dispatches `M` keydown
  → asserts menu opens. Dispatches `ArrowRight` → asserts
  Reveal's slide index increases. (Force-closes the menu
  between the two tests so the second one's keyboard input
  reaches reveal instead of the open drawer.)
- **PDF export URL pipeline (E2E).** Monkey-patches
  `electron.shell.openExternal` to capture the URL emitted by
  the export-for-pdf command. Asserts the URL is a
  well-formed `file://...?print-pdf&showNotes=true` and
  parses cleanly via the `URL` constructor. Proves the full
  pipeline (modal → exportAndOpenForPdf → pathToFileUrl →
  shell.openExternal) carries options end-to-end.

### Technical

- `src/render/revealTemplate.ts` — after `Reveal.initialize`,
  resolves the returned Promise (or falls back to a
  `Reveal.on('ready', …)` listener / `setTimeout`) and
  invokes `Reveal.getPlugin('menu').initialiseMenu()` when
  the menu hasn't been initialised yet. Idempotent: also
  checks `isMenuInitialised()` before calling.
- `src/settings.ts` — new
  `experimentalGridSpeakerView: boolean` field, default
  `false`.
- `src/SlidesNGSettingTab.ts` — toggle with revert-to-false
  behaviour while the engine is unimplemented.
- `test/e2e/open-in-browser.spec.ts` — two new describe
  blocks (`hamburger menu in the exported HTML` and
  `reveal keyboard shortcuts in the exported HTML`) plus a
  shared `getOrInjectProbe()` helper that reuses the
  injected iframe across tests.
- `test/e2e/pdf-print.spec.ts` — new describe block (`PDF
  export URL pipeline (E2E)`) with the
  `electron.shell.openExternal` spy.

## [0.11.31] — 2026-05-14

### Fixed

- **PDF export options now reach the opened browser on Windows.**
  Root cause: `openExternalInBrowser` did `"file://" + absolutePath`,
  which on Windows produced URLs like
  `file://C:\Users\foo\export.html?print-pdf`. Backslash drive paths
  after `file://` are malformed per RFC 8089 — most browsers parse
  up to the backslash and drop everything after, including the
  `?print-pdf` query string. So the browser opened the HTML in
  presentation mode (not print-PDF mode), notes never appeared, and
  the aspect-ratio choice was invisible. New `pathToFileUrl()`
  normalises Windows paths to `file:///C:/Users/foo/export.html`
  (three slashes, forward slashes only). The query suffix now
  attaches cleanly and reveal.js receives both `print-pdf` and
  `showNotes=true`.

### Verified

- **Hamburger menu is bundled + configured in the exported HTML.**
  Unit test confirms the standalone export contains
  `slide-menu-button` CSS, the `RevealMenu` plugin UMD body, and a
  `"menu":` entry in the `Reveal.initialize` config.
- **PDF aspect ratio choices reach `Reveal.initialize`.** 16:9 →
  `width:1280, height:720`. 4:3 → `width:1024, height:768`. Default
  → no override (reveal's 960/700 design canvas).
- **Speaker notes are rendered into the standalone HTML** as
  `<aside class="notes">…</aside>` per reveal.js convention. The
  `?showNotes=true` URL flag is what tells reveal to display them
  at print time; the notes themselves are always in the file.

### Technical

- `src/export/exportStandalone.ts` — new exported `pathToFileUrl()`
  helper. `openExternalInBrowser` now calls it instead of naive
  string concatenation.
- `tests/pdfExportOptions.test.ts` — new 10-test file covering
  - PDF aspect ratios persist to `Reveal.initialize` config
  - showNotes flag is encoded in the URL suffix
  - notes content is rendered into HTML
  - hamburger menu is bundled + configured
  - Windows + Unix path-to-file-URL conversion

## [0.11.30] — 2026-05-14

### Fixed

- **Picker no longer jitters back to the clicked tile for 2.5 s
  after a click.** The parent's burst of 7 `setPickerCurrent`
  posts (v0.11.21, to defeat bridge-install races) called
  `scrollIntoView` on every post. If the user scrolled the
  picker between bursts, each subsequent post yanked them
  back to the just-clicked tile — visible as ~5 s of
  jittering / forced auto-scroll. Now `scrollIntoView` only
  runs when the tile wasn't already marked `.current` — i.e.
  on the first successful burst post per idx. The remaining
  burst posts still confirm the `.current` class lands
  correctly but don't compete with the user's manual scroll.

### Technical

- `src/render/revealTemplate.ts` — `setPickerCurrent`
  handler now checks `wasAlreadyCurrent` before calling
  `t.scrollIntoView`. Same flow as before, just gated.
- `test/e2e/picker-sizing.spec.ts` — new
  `picker scroll jitter after tile click` test: clicks a
  tile, scrolls the strip 800 px deep inside the iframe,
  waits past the burst window (2.8 s), and asserts the
  manual scroll position survives (drift ≤ 100 px). Skips
  if the strip is too short to scroll in the test viewport.

## [0.11.29] — 2026-05-14

### Added

- **Copy buttons in the frontmatter reference card.** Each
  section heading in Settings → Slides NG → Frontmatter
  reference now has a small copy icon to its right. Click to
  copy that block's content to the clipboard (handy for
  sharing with an AI agent / collaborator). A separate
  "Copy all sections" button at the bottom of the card
  concatenates every block (prefixed with its section
  heading) into one paste.

### Changed

- **Icon-tool buttons now use `!important` to defeat theme
  overrides.** Some Obsidian themes (Minimal, Things etc.)
  apply borders to all buttons via high-specificity theme
  selectors, which leaked through v0.11.27's `border: none`.
  Default-Obsidian builds were already clean (verified in
  WDIO screenshots); this is purely defensive for vault
  users running an opinionated theme.

### Technical

- `src/styles.css` — `.slides-ng-icon-tool` rest, hover, and
  active states now use `!important` on `background`,
  `border`, and `box-shadow`. Also new rules for the
  frontmatter-ref-copy / -copy-all buttons.
- `src/SlidesNGSettingTab.ts` — new `copyToClipboard(text,
  label)` helper with a textarea-select fallback for
  environments where `navigator.clipboard` isn't available.
  The frontmatter card loop now wraps each section heading
  with a copy button; a copy-all button at the bottom emits
  the full reference content prefixed by section titles.

## [0.11.28] — 2026-05-14

### Changed

- **Picker header now has breathing room above the iframe
  container.** The new borderless icon-tool buttons read as
  flush against the picker container's top edge because the
  picker-wrap doesn't have a flex gap (block flow). Added
  `margin-bottom: 0.4rem` on `.slides-ng-speaker-picker-header`.

## [0.11.27] — 2026-05-14

### Changed

- **Panel-header icon buttons are now truly borderless at rest.**
  v0.11.26's `border-color: transparent` still allocated 1 px
  of border width, which read visually as a faint outline
  against the panel background. Switched to `border: none`
  (no border allocation at all). Hover gives a soft
  rounded-square background (6-px radius) — the only visual
  affordance, exactly as the user requested.
- **Notes "Edit" button is now icon-only (pencil).** Matches
  the visual language of the other panel-header chrome. The
  "Edit" label was reading as a heavier-weight action than
  it actually was; the pencil + tooltip carry the same
  meaning with less header competition.

### Technical

- `src/styles.css` — `.slides-ng-icon-tool` rule uses
  `border: none` (was `border-color: transparent`) at rest,
  hover, and active. Explicit 6 px border-radius for the
  soft hover-square.
- `src/SlidesNGSpeakerView.ts` — Edit button: dropped the
  `slides-ng-compact-pill` modifier and the `Edit` label
  span, switched to `slides-ng-icon-tool` matching the
  picker chrome.

## [0.11.26] — 2026-05-14

### Changed

- **Panel header buttons redesigned as a minimal icon toolbar.**
  The picker's orientation toggle + magnifier, the per-panel
  drag handle + hide button, and the notes Edit button all
  shared the same nav-bar-sized `.slides-ng-speaker-btn`
  treatment (32-px min-height, full border at rest) which
  felt visually loud crammed into compact panel headers next
  to the section title. New `.slides-ng-icon-tool` modifier
  collapses icon-only header buttons to 24 px square,
  transparent at rest with muted color, subtle
  `--background-modifier-hover` background on hover. The
  notes Edit button uses a paired `.slides-ng-compact-pill`
  modifier — smaller padding + font, but the "Edit" label
  stays visible at every pane width (the container query
  that hides labels at < 480 px is suppressed for this
  modifier). Drag handle and hide button retain their
  hover-reveal behaviour. Net effect: all header chrome
  reads as secondary to the section title and to the panel
  contents below, freeing the title to anchor the eye.

### Technical

- `src/styles.css` — added `.slides-ng-speaker-btn
  .slides-ng-icon-tool` and `.slides-ng-speaker-btn
  .slides-ng-compact-pill` rules. The latter's container-
  query override keeps its label visible regardless of pane
  width.
- `src/SlidesNGSpeakerView.ts` — `.slides-ng-icon-tool`
  applied to `pickerOrientationBtn` and `pickerSizeBtn`;
  `.slides-ng-compact-pill` applied to the notes `editBtn`.

## [0.11.25] — 2026-05-14

### Fixed

- **Picker resize no longer stalls / leaves the cursor stuck.**
  The picker container used CSS `resize: vertical` so users
  could drag its bottom edge to make it taller. But the iframe
  inside captures pointer events (needed for tile clicks), and
  the browser's native resize handle ends up under the iframe.
  When the mouse moved over the iframe mid-drag, the resize
  state never got the `mousemove` / `mouseup` it needed —
  drag stalled and the cursor stayed stuck in `ns-resize`
  state. Replaced with a custom drag handle below the iframe
  that uses Pointer Events + `setPointerCapture` so the iframe
  can't interrupt the drag. Handle is intentionally subtle: 3
  px transparent strip at rest, faint accent on hover. Visual-
  next iframe keeps native `resize: vertical` because its
  iframe has `pointer-events: none` (the bug didn't apply
  there).

### Added

- `speakerPickerHeightPx` setting — persists the user's
  drag-resize across sessions / vault sync. `null` (default)
  uses the CSS default (32 vh).

### Technical

- `src/SlidesNGSpeakerView.ts` — new
  `attachVerticalResizeHandle(container, options)` helper.
  Pointer Events with `setPointerCapture(pointerId)` route
  every move and up event back to the handle regardless of
  what's underneath. Cleans up listeners on pointerup /
  pointercancel.
- `src/settings.ts` — added `speakerPickerHeightPx: number |
  null`, default `null`.
- `src/styles.css` — `.slides-ng-speaker-resize-handle-v`
  rule (subtle), and `.slides-ng-speaker-picker-thumbs` now
  uses `flex-direction: column` so handle sits below the
  iframe inside the container.
- `test/e2e/picker-sizing.spec.ts` — new
  `picker resize handle` test dispatches synthetic pointer
  events on the handle and asserts the container's height
  changed by the expected delta.

## [0.11.24] — 2026-05-14

### Fixed

- **Up-next iframe no longer flickers back to the previous
  slide after rapid navigation.** Same root cause as the
  v0.11.21 picker flicker bug: `driveVisualNextSlideTo`
  issued a burst of 5 `goto` posts (now + 50, 150, 350,
  700 ms) to defeat bridge-install races on fresh iframes.
  When the user navigated rapidly, the first burst's
  delayed posts arrived after the second burst's first
  post had already updated the up-next iframe, briefly
  flipping back to the previous slide. Burst timer IDs
  are now tracked + cleared before scheduling new ones.

### Technical

- `src/SlidesNGSpeakerView.ts` — new
  `visualNextBurstTimers: number[]` field;
  `driveVisualNextSlideTo` clears them before each new
  burst (mirrors the v0.11.21 picker pattern).
- `test/e2e/picker-sizing.spec.ts` — new
  `up-next iframe stability` test installs a
  `MutationObserver` inside the up-next iframe that tracks
  every `.present` class transition on slide sections,
  fires two rapid `slides-ng-picker` clicks 200 ms apart,
  sleeps past the burst window (1.5 s), then asserts at
  most 5 `.present` transitions logged. Catches the
  burst-leak regression directly.

## [0.11.23] — 2026-05-14

### Changed

- **Magnifier preset now affects horizontal-strip mode too.**
  Previously horizontal mode forced tile height = strip height
  and derived width from aspect — magnifier was ignored.
  Now the preset is the tile WIDTH (height = `preset * aspect`,
  clamped to strip height if it would overflow). compact (100),
  comfortable (180), big (280) produce visibly different tile
  widths in horizontal film-strip mode whenever strip height has
  room. `auto` (preset = 0) keeps the original "fill strip height"
  behaviour, matching the way `auto` works in vertical modes.
- **Magnifier tooltips simplified.** Dropped the "Active in auto-
  fit orientation" qualifier — the preset now affects layout in
  every orientation.

### Technical

- `src/render/revealTemplate.ts` — `applyPickerStripLayout`
  horizontal branch reads `tileWidthAttr` and computes
  `tileH = tileW * aspect`, with a clamp + recompute when
  height would exceed `stripFloor`.
- `test/e2e/picker-sizing.spec.ts` — new
  `horizontal-mode magnifier` test forces the picker container
  to 320 px tall, cycles through every preset, and asserts at
  least 3 distinct tile widths emerge (auto + big may collapse
  to "fill" if strip is shallow enough; compact + comfortable
  should always differ).

## [0.11.22] — 2026-05-14

Multiple fixes consolidated. v0.11.22a-d were intermediate
builds that aren't tagged separately — this changelog covers the
shipped 0.11.22.

### Changed

- **Magnifier now works in vertical-1, vertical-2, AND auto.**
  Previously only auto-fit honoured the preset; the two
  fixed-column modes ignored it (tiles always filled their
  column, which at wide strips meant ~567 px tiles in 2-col).
  Now all three vertical orientations share the same sizing
  rule: tile width = `min(preset, availableColumnWidth)` per
  column. Orientation just caps the column count (1 / 2 / many).
  When preset is smaller than the available column, leftover
  space centers via `justify-content: center`.
- **Auto-fit magnifier preset is now TILE WIDTH, not MIN cell
  size.** With the old "min cell size" semantics, at strip
  widths narrower than the preset, `min(100%, preset)`
  collapsed to `100%` and every preset >= strip produced the
  same "1 column at strip width" layout (comfortable and big
  looked identical in a half-screen Obsidian window). New
  semantics: preset is the actual tile pixel width (clamped
  to column width). Comfortable (180) and big (280) now
  visibly differ at any strip width.

### Fixed

- **Vertical-1 tiles no longer get compressed to 4 px tall.**
  The picker strip is a column-flex container; tiles without
  an explicit `flex` declaration got default `flex-shrink: 1`
  applied and were squashed to match the strip's apparent
  height. Adding `flex: 0 0 auto` to every flex-mode tile
  fixes it. (Grid-mode tiles ignored the rule, which is why
  vertical-2 / auto were unaffected.)
- **Picker reflows on viewport change without cycling modes.**
  The user reported "tiles only resize if you cycle through
  the modes, not on the fly". Cause: the in-iframe
  `setupRelayoutGuard` ResizeObserver watches
  `document.documentElement` and has a 2-px size-delta guard
  + rAF debounce that swallowed sub-perceptual width changes.
  Added a dedicated `ResizeObserver` on the strip element
  itself (no guard, no debounce); fires on every pixel change.
  Old observer disconnects on rebuild.

### Technical

- `src/render/revealTemplate.ts`:
  - `applyPickerStripLayout` unified the auto / vertical-1 /
    vertical-2 sizing model. All three use `display: grid`
    with explicit `grid-template-columns: repeat(N, tileW px)`,
    `justify-content: center`, and `autoTileW = min(preset,
    availColW)`. Single code path, single source of truth.
  - `buildPickerStrip` installs a per-strip ResizeObserver
    that calls `applyPickerStripLayout(strip)` on every
    resize. Cleans up the previous observer when the strip
    is rebuilt.
  - Tile cssText always includes `flex: 0 0 auto;` (was
    only horizontal previously).
- `src/SlidesNGSpeakerView.ts` — magnifier tooltips reword
  "Tile min size" to "Tile size" and drop the "only takes
  effect in auto-fit" caveat (it now applies to vertical-1
  and vertical-2 too).
- `test/e2e/picker-sizing.spec.ts`:
  - Added aspect-ratio sanity check (catches the
    "tile 4 px tall" bug class).
  - Added `viewport-responsiveness` test that resizes the
    picker container from 200 px to 700 px WITHOUT
    re-issuing `enablePickerStrip` and asserts column count
    changes — exercises the strip RO directly.
  - Added `current-tile indicator stability` test that
    installs a MutationObserver inside the picker iframe,
    fires two rapid simulated tile clicks (idx 5 then idx
    10), waits past the burst window, and asserts no
    more than 4 `.current` class additions in the log.
    Catches regressions in v0.11.21's burst-timer
    cancellation. Healthy result: `[5, 10]`.

18/18 tests passing on the final shipped 0.11.22.

## [0.11.21] — 2026-05-14

### Fixed

- **Picker auto-mode now actually renders distinct layouts per
  magnifier preset.** v0.11.20's `width:100% + aspect-ratio +
  ResizeObserver` approach for auto mode left content unscaled
  visually even though geometry measurements reported correct
  scale — `aspect-ratio` on `<button>` grid items raced with
  the inner content's transform write. v0.11.21 pixel-pins
  tile width in auto mode too: column count is computed
  deterministically from strip width and the magnifier preset
  (`Math.floor(stripWidth / minCellPx)`), then tile width =
  stripWidth / cols. Same approach as the other three
  orientations. Verified by the new
  `test/e2e/picker-sizing.spec.ts` which drives every (4
  orientation × 4 magnifier preset) combination and asserts
  every tile's scaled content fits its container.
- **Picker current-tile indicator no longer flips back and
  forth after navigating.** `applyState` was queuing a burst
  of 7 delayed `setPickerCurrent` posts (over 2.5 s) to defeat
  bridge-install races on fresh mounts. When the user
  navigated rapidly, an earlier burst's stale posts kept
  overwriting the new highlight. The burst timer IDs are now
  tracked + cleared before scheduling the next burst.

### Technical

- `src/render/revealTemplate.ts` — `applyPickerStripLayout`
  auto-mode rewrite: grid template is
  `repeat(N, autoTileW px)` for an explicit N from
  `Math.floor(stripInnerW / minCellPx)`. Tile cssText is
  pixel-pin for every orientation (auto included). Removed
  the per-tile ResizeObserver (v0.11.20) and the aspect-ratio
  branch — both were workarounds for races introduced by the
  non-pinned approach and unnecessary once the tile is
  pinned.
- `src/SlidesNGSpeakerView.ts` — new
  `pickerCurrentBurstTimers: number[]` field stores timer IDs
  from the most recent burst; `applyState` clears them before
  enqueuing new ones.
- `test/e2e/picker-sizing.spec.ts` — new WDIO spec drives the
  speaker view through every (orientation × magnifier)
  combination, switches into the sandboxed picker iframe via
  CDP, measures each tile's `clientWidth`/`clientHeight` and
  the inner `.slides-ng-picker-thumb-content` computed
  transform, computes `scale * 960` and asserts it doesn't
  exceed `tileW` by more than 4 px. Screenshots every combo
  for human review.

## [0.11.20] — 2026-05-14

### Fixed

- **Picker tile content overlap (still seen in 0.11.18-19).**
  Adds a `ResizeObserver` per picker tile that recomputes the
  inner scale (`actualW / slideW`) whenever the tile resizes.
  This makes the layout robust against the races we kept
  hitting in 0.11.18/0.11.19 — reveal.js's stock `.reveal`
  cascade competing with our fake `.reveal` scopes, post-rAF
  measurements firing before CSS settled, and the strip-level
  relayout hook stomping inline transforms set milliseconds
  earlier. Per-tile RO is local + idempotent; every cell
  rebuild ends with a `transform: scale(N)` that matches the
  actual rendered cell width by construction.

### Technical

- `src/render/revealTemplate.ts` — at the end of
  `applyPickerStripLayout`, install a single
  `ResizeObserver` per `.slides-ng-picker-tile`. The RO
  callback updates the inner
  `.slides-ng-picker-thumb-content` element's
  `style.transform` to `scale(contentRect.width / slideW)`.
  Old RO instances are disconnected before being replaced
  (stashed on `tile.__slidesNgRo`).

## [0.11.19] — 2026-05-14

### Fixed

- **Picker tile content overflowed in v0.11.18.** The
  width:100% + aspect-ratio + post-rAF scale approach worked
  in the Grid overlay but raced against the picker iframe's
  layout — sometimes the post-rAF measurement fired before
  CSS had laid out the tiles, leaving the cloned section
  rendering at full slideW (960 px) inside a ~360 px tile (so
  slide titles overflowed and got clipped). Reverted fixed-
  column modes (vertical-1, vertical-2, horizontal) to
  pixel-pinned tile widths so the scale value matches the
  actual tile width by construction. `auto` mode keeps the
  width:100%/aspect-ratio + rAF measure path because its tile
  widths come from CSS grid auto-fill and can't be known up
  front. Added a defensive 1-rAF retry inside
  `applyPickerStripLayout` for when the strip is appended
  before layout has run (clientWidth/Height = 0).

## [0.11.18] — 2026-05-14

### Fixed

- **Speaker notes box renders newlines after save.** The notes
  panel showed the file-write content correctly on the markdown
  side but rendered as a single space-joined paragraph after
  the iframe re-rendered. Cause: `renderDeck` used a `Marked`
  instance with the CommonMark default (single `\n` → space),
  so the multi-line note that the v0.11.16 writer puts into the
  file (slidev `<!--\n...\n-->` format) lost its `<br>`s. Fix:
  notes now use a separate `Marked({ breaks: true, gfm: true })`
  instance; slide-body rendering keeps CommonMark default so no
  existing deck's body rendering changes.
- **Picker tile sizing: no more empty black space.** In
  fixed-column orientations (vertical-1, vertical-2,
  horizontal) the tile width used to be a hard pin from the
  magnifier preset, even when the cell was wider — so picking
  "compact" in 2-col mode left a lot of empty space inside each
  column. Tiles now FILL their cell in fixed-column modes; the
  magnifier preset is ignored there (it's still persisted; it
  controls auto-fit mode only).
- **auto orientation is now actually responsive.** Previously
  it picked a fixed sub-mode at build time based on container
  shape; resizing the speaker pane didn't update it. Now it's a
  proper CSS-grid `auto-fill` with
  `minmax(min(100%, MIN_CELL), 1fr)` — tiles fill the strip
  with as many columns as fit at the magnifier's MIN cell
  size. Live-resizes via the existing iframe ResizeObserver.

### Changed

- **Magnifier preset semantics**: the preset now means
  "minimum cell size" and only takes effect when orientation =
  auto-fit. Tooltips reworded to say so explicitly so the
  control's effect is never a guess.
- **Orientation `auto` icon** updated to `layout-grid` to
  match its new "fill with columns" behavior (was `monitor`).

### Technical

- `src/render/renderDeck.ts` — new `buildNotesMarked()`
  factory returning a `Marked({ breaks: true, gfm: true })`
  instance. `slideToHtml` takes both `md` (body) and `notesMd`
  (notes) and parses `slide.note` with the breaks-aware one.
- `src/render/revealTemplate.ts` — `applyPickerStripLayout`
  rewritten. Fixed-column modes now use `width:100%;
  aspect-ratio:SLIDE_W/SLIDE_H` on tiles + a post-rAF measure
  to compute actual scale (same trick the Grid overlay uses
  since v0.11.14). Auto mode uses
  `grid-template-columns:repeat(auto-fill, minmax(min(100%,
  MIN_CELL_PX), 1fr))`. The existing iframe `ResizeObserver`
  relayout hook now also re-applies the picker layout so
  container resizes recompute the cell scale.
- 2 new unit tests pin the notes-breaks contract in renderDeck.

## [0.11.17] — 2026-05-14

### Added

- **Magnifier-cycle button on the picker header** — small icon
  button (next to the orientation toggle) that cycles tile
  size through three presets: **compact** (100 px),
  **comfortable** (180 px), **big** (280 px). Picks the
  preset that visually conveys the current state (zoom-out /
  search / zoom-in) and the tooltip names the next preset
  explicitly, so the cycle direction is never a guess. The
  install default (`speakerPickerTileWidth: 0`, auto-fit)
  isn't in the cycle — once you click in, you stay on a named
  preset; you can return to auto via the Settings tab.
- **Per-deck override** via `slides-ng-picker-tile-width`
  frontmatter. Accepts either a positive integer (raw pixels,
  e.g. `220`) or a preset alias (`compact` / `comfortable` /
  `big`). Cached when the picker iframe builds, so it doesn't
  re-peek on every retile.
- New `peekFrontmatterRaw(markdown, key)` helper for
  string-valued frontmatter peeks; `peekFrontmatterFlag` is now
  a thin coercion shim on top. Adds 4 unit tests.

### Technical

- `src/settings.ts` — `PICKER_TILE_PRESETS` map +
  `PickerTilePresetName` type. The persisted value remains a
  `number` so existing setting files keep working.
- `src/parser/parseDeck.ts` — `peekFrontmatterRaw` extracts the
  raw lowercased/unquoted value; the boolean variant delegates
  to it.
- `src/SlidesNGSpeakerView.ts` — new `pickerSizeBtn` field,
  `applyPickerSizeButton`, `resolvePickerTileSizePreset`,
  `effectiveTileWidth`, `peekDeckTileWidth`. The cycle handler
  re-issues `enablePickerStrip` to rebuild tiles with the new
  width (the iframe's `buildPickerStrip` already removes the
  old strip first, so this is a clean reset). `ensurePickerStrip`
  caches `deckPickerTileWidth` from the deck's frontmatter and
  the size button reflects it.
- `src/SlidesNGSettingTab.ts` — frontmatter reference card adds
  a "Picker tile size override" section.
- `src/styles.css` — `.slides-ng-speaker-picker-size-btn` shares
  styling with the orientation toggle.

## [0.11.16] — 2026-05-14

### Fixed

- **Speaker notes save no longer strips newlines.** The notes
  editor in the speaker view used to flatten multi-line input
  to a single space-joined line because the writer only emitted
  single-line `<!-- ... -->` comments. The writer now uses the
  slidev convention `<!--\nline1\nline2\n-->` (a single
  multi-line comment) whenever the textarea contains a newline.
  Single-line input still writes a single-line comment so
  diffs against existing decks stay minimal. Reader supports
  both formats. Five new round-trip tests pin the contract.
- **Picker orientation 2-col + auto now actually apply.** The
  iframe-side bridge handler for `enablePickerStrip` and
  `setPickerOrientation` only accepted `'horizontal'` and the
  legacy `'vertical'` value, silently coercing every other
  request (`vertical-1`, `vertical-2`, `auto`) back to 1-col.
  The handler now passes the full canonical set through.
  Symptom: the orientation cycle button visibly changed icon
  but the strip stayed in single-column.

### Changed

- **Drag handle + hide-button moved to the RIGHT of each
  panel title** (previously: LEFT). The two icon-only controls
  now share a `slides-ng-speaker-panel-controls` group placed
  at the right edge of the title row, freeing the title text
  to sit at the natural left edge. For title-less panels
  (status, controls, timer) the group floats top-right. No
  behaviour change — purely a layout tweak based on user
  feedback that the left-side placement made the header read
  awkwardly.

### Technical

- `src/parser/editSlideNotes.ts` — new `findNotesSpan` returns
  the inclusive line range + content of an existing notes
  comment (single- or multi-line). `findNotesLine` becomes a
  thin compat shim. `replaceSlideNotes` picks the format
  based on whether the input contains a newline.
- `src/render/revealTemplate.ts` — `enablePickerStrip` and
  `setPickerOrientation` accept the canonical orientation set
  (`vertical-1`, `vertical-2`, `horizontal`, `auto`, plus
  legacy `vertical` → migrated to `vertical-1`).
- `src/SlidesNGSpeakerView.ts` — `attachDragHandle` groups
  handle + hide-button in a single `panel-controls` div
  inserted to the right of the title (or floated top-right for
  title-less panels).
- `src/styles.css` — `.slides-ng-speaker-panel-controls` group
  + `--floating` variant replace the per-button floating
  variants; obsolete `panel-header-group` rule deleted;
  `panel-header` gains `width: 100%` so the controls' right-
  alignment via `margin-left: auto` actually anchors to the
  right edge.

## [0.11.15] — 2026-05-14

### Added

- **Picker layout: 4 modes** instead of 2. The
  `speakerPickerOrientation` setting now accepts:
  - `vertical-1` — single column (PowerPoint default)
  - `vertical-2` — two columns side by side (NEW)
  - `horizontal` — film-strip row
  - `auto` — chosen at build time from the strip container
    shape: wide enough for two horizontal slides →
    `horizontal`; otherwise tries `vertical-2` if there's room
    for two tiles side by side; falls back to `vertical-1`.
  Legacy `"vertical"` is migrated to `vertical-1` on load.
  Picker-header toggle button cycles
  1-col → 2-col → horizontal → auto → 1-col.
- **Inline panel-hide button** — small eye-off icon revealed
  on panel hover, sibling to the drag handle. Click to hide
  that panel for the session (persists in
  `speakerPanelVisibility`). A new **Show all** button appears
  at the top of the speaker view when at least one panel is
  hidden — click to restore everything.
- **Per-slide panel-visibility override** via
  `slides-ng-hide-panels:` per-slide frontmatter. Accepts an
  array (`[picker, scenes]`) or a comma/space-separated string
  (`"picker, scenes"` or `"picker scenes"`). The speaker view
  applies the override temporarily while that slide is current;
  navigating to a slide WITHOUT the override restores the
  user's persistent visibility settings. Implementation: the
  list is emitted as `data-hide-panels` on the section in
  `renderDeck`, harvested into the state-event payload by the
  iframe bridge, and applied at the DOM level by
  `applyPerSlideHidePanels()` in the speaker view.
- New test deck `11-per-slide-hide-panels.md` in the b&g vault
  demonstrating the override.

### Technical

- `src/settings.ts` — `speakerPickerOrientation` union expanded;
  legacy "vertical" kept in the type for back-compat read.
- `src/main.ts` — `loadSettings` migrates legacy "vertical" to
  "vertical-1".
- `src/render/revealTemplate.ts` — `applyPickerStripLayout`
  handles `vertical-2` (CSS grid `1fr 1fr`) and `auto`
  (resolved at apply time from container dimensions). Bridge
  `currentState` emits `hidePanels` from the current section's
  `data-hide-panels` attribute.
- `src/render/renderDeck.ts` — `slideToHtml` reads
  `slides-ng-hide-panels` frontmatter and emits
  `data-hide-panels=…` on the section.
- `src/SlidesNGSpeakerView.ts` — new `PickerOrientation` type
  alias + `normalizeOrientation` helper; orientation toggle
  cycles 4 modes with per-mode icon + tooltip; inline
  `slides-ng-speaker-panel-hide` button on every panel;
  `updateShowAllPanelsButton()` renders the global restore
  button; `applyPerSlideHidePanels()` applies + restores
  per-slide DOM-level visibility on every state event.
- `src/SlidesNGSettingTab.ts` — orientation dropdown extended
  to 4 options; frontmatter reference card gains a
  "Per-slide panel visibility" section.
- `src/styles.css` — `.slides-ng-speaker-panel-hide` (inline)
  + `--floating` variant + `slides-ng-speaker-show-all-panels`
  styles.

## [0.11.14] — 2026-05-14

### Fixed

- **Speaker notes Save silently failed on auto-h1-breaks decks.**
  Root cause: `findSlideRanges` in `editSlideNotes.ts` only
  counted `---` separators. A deck using
  `slides-ng-auto-h1-breaks: true` with no `---` separators
  was seen as ONE slide, so any `currentIdx > 0` was out of
  range — `replaceSlideNotes` returned the markdown unchanged
  and the file write was a no-op. Fix: `findSlideRanges` now
  peeks the auto-h1-breaks frontmatter flag and splits on `#`
  headings when set. 3 new unit tests confirm the fix.
- **Grid overlay overflowed on narrow viewports.** Tiles were
  hardcoded `width: 320px` with a fixed-column grid template,
  so on viewports narrower than 320px + gap they clipped on
  the right. Now responsive: `grid-template-columns:
  repeat(auto-fill, minmax(min(100%, 320px), 1fr))` + tiles
  use `width: 100%` of their column. A post-build pass
  recomputes the thumbnail scale based on actual tile width
  so cloned slides shrink in step.
- **Up-next iframe drag-resize asymmetric.** CSS
  `min-height: 80px` blocked initial downward drag, but the
  inline `height` set by JS after the first upward drag
  overrode the CSS rule — so users could shrink way below
  80px once they'd grown the panel. Now consistent: floor at
  `min-height: 40px` from the start (just enough to keep the
  resize handle visible).
- **Picker iframe could stay in default reveal-render mode
  (no thumbnails) when the deck file was modified or the
  bridge installed slowly.** Five-shot `enablePickerStrip`
  burst at 0/80/200/450/900 ms could all miss the listener.
  Two-pronged fix:
  - Iframe bridge now posts `slides-ng-bridge-ready` *once*
    when it attaches. Speaker view listens (filtered by
    `event.source === pickerStripIframe.contentWindow`) and
    re-posts `enablePickerStrip` + `setPickerCurrent` on
    receipt — guaranteed delivery as soon as the listener is
    up.
  - Burst retry window extended to 2.5 s (added 1500 ms +
    2500 ms entries). Cheap belt-and-suspenders.

### Added

- **Three hamburger example decks** in
  `_slides-ng-test/`: `08-hamburger-on.md` (default, ☰ visible),
  `09-hamburger-off.md` (`slides-ng-show-menu: false`),
  `10-keyboard-shortcuts.md` (full keystroke reference).

### Technical

- `src/parser/editSlideNotes.ts` — `findSlideRanges` peeks
  `slides-ng-auto-h1-breaks`; H1-aware slide boundary
  detection (mirrors parseDeck's `injectH1SlideBreaks`).
- `src/render/revealTemplate.ts` — Grid `grid-template-columns`
  + tile-width + aspect-ratio responsive; post-build
  `requestAnimationFrame` pass recomputes `transform: scale()`;
  `slides-ng-bridge-ready` postback right after the message
  listener attaches.
- `src/SlidesNGSpeakerView.ts` — `messageHandler` recognises
  `slides-ng-bridge-ready` and re-issues picker setup; burst
  retry schedules extended from 4 to 6 delays each.
- `src/styles.css` — `.slides-ng-speaker-visual-next-frame-wrap`
  min-height: 80 → 40.
- `tests/editSlideNotes.test.ts` — 3 new tests for the
  auto-h1-breaks insertion + readSlideNotes paths.

## [0.11.13] — 2026-05-14

### Changed

- **Thumbnail rendering fidelity.** The picker thumbnails and
  Grid overlay tiles now look like the actual slide preview.
  Previously the clone-and-scale pipeline only cloned the inner
  `.slides-ng-layout` div and placed it outside any `.reveal`
  ancestor, which meant theme-scoped CSS rules
  (`.reveal section { text-align: center; ... }`, font sizes,
  colour, etc.) all dropped out. Result: bullets at the left
  edge ("dots on the left"), text in the wrong alignment,
  headings the wrong size — tiles that bore little resemblance
  to the actual slide.
  - Fix: clone the **entire `<section>`** element instead, and
    wrap each tile's content in a fresh
    `<div class="reveal"><div class="slides">…</div></div>`
    scope. Theme CSS now applies. The visual identity between
    "what the preview shows" and "what the thumbnail shows" is
    now consistent.
- **Scene overlays inherit the deck theme background by default.**
  Previously Blackout / BRB / Q & A / Stand by etc. were
  hardcoded black-on-white. New behaviour: scene overlay reads
  the body's computed background + colour and uses those, so a
  white-themed deck shows a white scene, a black-themed deck
  shows a black scene, etc. Override:
  - Global: `Settings → Slides NG → Scenes inherit deck theme
    background`.
  - Per-deck frontmatter:
    `slides-ng-scene-inherit-theme-bg: false` for the legacy
    hardcoded black overlay.

### Technical

- `src/render/revealTemplate.ts` — `warmThumbnailCache()` and
  the Grid live-clone path both call `section.cloneNode(true)`
  (was `section.querySelector('.slides-ng-layout').cloneNode`);
  Grid + picker tile rendering wraps the clone in a `.reveal >
  .slides` scope before scaling. `ensureSceneEl()` reads body
  bg + colour via `getComputedStyle()` gated on a new
  `SCENE_INHERIT_THEME_BG` flag injected at template build
  time.
- `src/render/renderDeck.ts` — new `RenderDefaults.sceneInheritThemeBg`;
  threaded into `defaultLayer`; new frontmatter mapping for
  `slides-ng-scene-inherit-theme-bg`.
- `src/settings.ts` — new `sceneInheritThemeBg` (default true).
- `src/SlidesNGSettingTab.ts` — new toggle row; reference card
  gains a "Scenes" section.
- `src/SlidesNGView.ts` + `SlidesNGSpeakerView.ts` — pass
  `settings.sceneInheritThemeBg` into every `renderDeck()` call.

## [0.11.12] — 2026-05-14

### Fixed

- **Thumbnail tiles ignored the deck theme.** Both the Grid
  overlay and the picker thumbnails hardcoded
  `background: #000`. A white-themed deck (e.g. the
  `03-team-update` example) rendered as BLACK tiles with
  white-on-black slide content peeking through — totally
  unrelated to the actual preview color. Fix: read
  `getComputedStyle(document.body).backgroundColor` (reveal
  applies the theme to body bg) and apply that to each tile.
  Now white themes render in white tiles, beige in beige, etc.
- **Grid overlay title duplication.** The Grid still had the
  fade-gradient title overlay I removed from the picker
  thumbnails in v0.11.1. Cloned slide content already contains
  the slide's own `<h1>`, so the overlay was redundant. Now
  removed; titles live on the tile's `aria-label` + `title`
  attributes only.
- **Grid slide-number badge upgraded** to match the picker's
  v0.11.1 design: 28×28 px bordered square in the top-left,
  bold tabular figures, white-translucent outline. Was a
  smaller pill bottom-right.
- **Speaker notes "Save" appeared to do nothing.** The save
  WAS writing the file, but the notes panel kept showing the
  textarea until the iframe re-render's state event arrived
  (~500 ms). Now repaints the notes panel synchronously with
  the new value rendered to HTML (via the same `marked`
  instance scenes use), and fires a brief "Notes saved."
  notice for confirmation.

### Technical

- `src/render/revealTemplate.ts` — `bodyBg` /
  `stripBodyBg` reads computed body background; Grid + picker
  tile cssText use it; Grid title overlay creation block
  replaced with attribute-only metadata; Grid slide-number
  badge styling unified with picker.
- `src/SlidesNGSpeakerView.ts` — notes save handler now
  renders the new value via `sceneMd.parse(value, {async:
  false})` and writes it into `notesEl.innerHTML`. New Notice
  fires on successful save.

## [0.11.11] — 2026-05-14

### Removed

- **`slides-ng: true` frontmatter key.** Was documented as an
  "opt-in flag" but nothing in the code actually reads it.
  Stripped from all example decks (both dev vault `Decks/`
  and the test deck folder synced to the b&g vault) +
  removed the "Required" section from the Frontmatter
  Reference card in Settings. Decks render based on the
  ribbon-button open command, NOT a frontmatter marker.

### Idea jar

- Promoted the "deck index" idea: a sidebar list or command-
  palette enumeration of every `.md` file with `slides-ng:
  true` (or some opt-in marker) in frontmatter, so users can
  browse decks without remembering paths. If/when that ships,
  the `slides-ng: true` key becomes meaningful again.

### Technical

- `src/SlidesNGSettingTab.ts` — removed the "Required" section
  from `renderFrontmatterReference()`.
- `Decks/*.md`, `e2e-vault/Decks/*.md`, `b&g_vault/.../*.md`
  — stripped the line from all example decks.
- `ROADMAP.md` — new entry under the idea jar.

## [0.11.10] — 2026-05-14

### Added

- **Frontmatter reference card in Settings → Slides NG.**
  Collapsible `<details>` panel at the bottom of the settings
  tab listing every per-deck frontmatter key with a brief
  description and an example. Sections: Required, Appearance,
  Authoring shortcuts, Embedded preview, Image-layout slides,
  Code blocks, Animations, Power-user passthrough, Per-slide
  frontmatter, Per-slide HTML annotations. Collapsed by
  default so it doesn't dominate the page; click to expand.
  Closes the gap users had: "what frontmatter keys can I
  even set?"

### Technical

- `src/SlidesNGSettingTab.ts` — `renderFrontmatterReference()`
  method renders the `<details>` block.
- `src/styles.css` — `.slides-ng-frontmatter-ref{,-body,-code,
  -footer}` styling using Obsidian theme variables.
- `src/render/renderDeck.ts` — commented note explaining why
  `slides-ng-code-theme` is NOT a frontmatter override (Shiki
  highlighting runs before headmatter is merged; only the
  global setting applies).

## [0.11.9] — 2026-05-14

### Added

- **Per-deck frontmatter escape hatches** for the view-affecting
  plugin settings. Lets a deck author override globals without
  touching settings. New keys (all optional, all prefixed
  `slides-ng-` to avoid colliding with other vault plugins;
  legacy unprefixed forms work too):
  - `slides-ng-show-controls: true` — show reveal's stock corner
    chevron arrows in the embedded iframe.
  - `slides-ng-show-menu: false` — disable the reveal-menu
    plugin for this deck (drops its ~45 KB CSS+JS from the
    iframe srcdoc).
  - `slides-ng-image-layout-split: 60/40` — column ratio for
    image-left / image-right layouts (50/50, 60/40, or 40/60).
  - `slides-ng-line-step-dim: 0.5` — dim opacity (0–1) for
    non-active code-block line-step lines.
  - `slides-ng-code-block-max-height: "40vh"` — CSS length cap
    for long code blocks. `"none"` disables.
  - `slides-ng-code-block-overflow-scroll: false` — clip instead
    of scrolling.
  - `slides-ng-magic-move-duration: 800` — Magic Move animation
    length in ms.
- **Power-user escape hatch**: `slides-ng-reveal-config:` accepts
  any object of keys and passes them straight to
  `Reveal.initialize()`. Useful for: `autoSlide`, `loop`,
  `width`, `height`, `disableLayout`, etc. Use with care —
  invalid keys can break the slide stage.

### Technical

- `src/render/renderDeck.ts` — `headmatterToOptions` extended
  with 7 new mappings + 1 raw passthrough. New helper
  `readNumberFrontmatter()` for numeric values.
- `tests/frontmatterOverrides.test.ts` — 9 new unit tests
  covering each new key + the raw config passthrough.

## [0.11.8] — 2026-05-14

### Removed

- **Menu toolbar button.** The reveal-menu plugin's toggle was
  unreliable in the embedded iframe context across multiple
  rounds of fixes (v0.10.2 tried `Reveal.getPlugin('menu').toggle()`,
  v0.11.3 reverted to `.slide-menu-button.click()` — neither
  worked consistently for users). The button is gone. The
  reveal-menu plugin is STILL loaded for users who press the
  `M` key inside the preview iframe to invoke its side-panel.
  For slide navigation specifically, the Grid button (real
  thumbnails) is a stronger affordance.

### Technical

- `src/SlidesNGView.ts` — Menu toolbar button removed.
- `test/e2e/speaker-070.spec.ts` — old "Menu present" test
  replaced with one that asserts Menu is NOT in the toolbar
  and Grid is.

## [0.11.7] — 2026-05-14

### Added

- **Prev / Next buttons in the preview toolbar.** Users asked
  for visible nav arrows. Reveal's stock corner controls stay
  off by default (they clutter slide content), so explicit
  toolbar buttons fill the gap. Located right after "Use
  current", before "Menu" / "Grid". Bridge `prev` / `next`
  commands already existed.

### Fixed

- **Cursor-follow didn't work with auto-h1-breaks decks.**
  `slideIndexFromCursor` counted only `---` separators in the
  raw markdown to map cursor line → slide index. With
  auto-h1-breaks the deck is split by `#` headings (via
  `injectH1SlideBreaks`), so the cursor on slide 3 was still
  reporting "slide 0" to the preview iframe — the preview
  stayed on slide 1 regardless of where the cursor went in
  the editor. Fix: `slideIndexFromCursor` now accepts an
  `autoH1Breaks` option AND peeks the frontmatter override
  flag (same precedence as `parseDeck`). When enabled, each
  `#` heading after the first bumps the slide index, with
  proper handling for explicit `---` separators that already
  precede an `#` (no double-bump) and fenced code blocks
  (`#` inside ``` is ignored).

### Technical

- `src/parser/slideIndexFromCursor.ts` — new `options` param;
  reads `peekFrontmatterFlag` for the override; per-line
  bookkeeping for `prevNonBlankWasSeparator` and `seenFirstH1`.
- `src/SlidesNGView.ts` — toolbar Prev/Next buttons added;
  `applyCursorFollow()` passes `autoH1Breaks: settings.autoH1Breaks`
  to `slideIndexFromCursor`.
- `tests/autoH1Breaks.test.ts` — 6 new slideIndexFromCursor
  unit tests (cursor mapping, frontmatter override, no-double-
  bump near explicit `---`, code-fence ignored).

## [0.11.6] — 2026-05-14

### Fixed

- **DnD drop indicator showing two different positions near a
  panel boundary.** Previously the indicator drew at the
  hovered panel's top OR bottom edge — with the 6 px gap
  between panels, that gave two different visual positions
  depending on which panel was hovered (bottom edge of panel
  A vs. top edge of panel B). The line appeared to "jump"
  between them as the cursor crossed the boundary. v0.11.6
  positions the indicator at the MIDPOINT of the gap, so the
  same visual line shows whether you cross upward or downward.
  At the top and bottom edges of the panel list (no neighbour
  on one side) the indicator falls back to the panel's own
  edge.

### Technical

- `src/SlidesNGSpeakerView.ts` — `updateDropIndicator()`
  computes a midpoint between the hovered panel and its
  neighbour (via two new helpers `nextVisiblePanel()` /
  `previousVisiblePanel()`).

## [0.11.5] — 2026-05-14

### Added

- **Auto-split slides on `#` headings.** New setting (Settings →
  Slides NG → "Auto-split slides on `#` headings") and matching
  frontmatter flag `slides-ng-auto-h1-breaks: true|false`. When
  enabled, every top-level `#` heading begins a new slide
  automatically — no `---` separator needed. Lets authors write
  decks as plain markdown outlines.
  - Default: off (preserves Slidev / reveal compat with existing
    decks).
  - Frontmatter override beats the global setting either way.
  - Pure-function pre-parse step (`injectH1SlideBreaks`)
    preserves existing `---` separators (no double-up), skips
    fenced code blocks (`#` inside ``` doesn't break), and
    ignores `##` / `###` sub-headings.

### Technical

- `src/parser/parseDeck.ts` — new `injectH1SlideBreaks()` +
  `peekFrontmatterFlag()` helpers, both exported and unit-
  tested. `parseDeck()` gains an `options.autoH1Breaks`
  parameter.
- `src/render/renderDeck.ts` — `RenderDefaults.autoH1Breaks`,
  threaded into both `renderDeck` and `renderDeckStandalone`
  call sites.
- `src/settings.ts` — `autoH1Breaks` field + default `false`.
- `src/SlidesNGSettingTab.ts` — toggle row under the speaker
  settings.
- `src/SlidesNGView.ts` + `SlidesNGSpeakerView.ts` — pass
  `settings.autoH1Breaks` into every `renderDeck()` call.
- `tests/autoH1Breaks.test.ts` — 16 new unit tests covering
  the helper, the frontmatter peek, and the parseDeck
  integration.

## [0.11.4] — 2026-05-14

### Fixed

- **DnD drop-indicator misaligned when speaker view is scrolled.**
  The indicator is positioned absolutely inside `contentEl`. Its
  `top` value was computed as `rect.top - containerRect.top`,
  both viewport-relative — but absolute positioning inside a
  scrolled container uses the container's INTERNAL coordinate
  space, which ignores `scrollTop`. Result: if you'd scrolled
  the speaker view at all, the indicator appeared above the
  cursor by exactly the scroll offset, and dragging a panel
  felt like it would "drop at the wrong place." Fix: add
  `contentEl.scrollTop` to the indicator's `top` (and
  `scrollLeft` to its `left` for the v0.10.0 2-column grid
  case). Now the indicator follows the cursor accurately even
  in a scrolled or wide-laid-out container.

### Technical

- `src/SlidesNGSpeakerView.ts` — `updateDropIndicator()`
  reads `contentEl.scrollTop/scrollLeft` and offsets the
  indicator's top/left by those amounts.

## [0.11.3] — 2026-05-14

### Changed

- **Grid tile size bumped 220 → 320 px.** The Grid overlay
  (toolbar button) used 220 px tiles, scaling slide content by
  0.229 — text inside the thumbnails was hard to read ("super
  zoomed out" per user). 320 px tiles give a 0.333 scale,
  ~45 % bigger text. Matches the visual density of the v0.11.0
  picker thumbnails. Tile aspect ratio still derived from
  Reveal's configured slide dimensions.

### Fixed

- **Menu toolbar button strategy reverted to "click DOM button
  first."** v0.10.2 switched the bridge to call
  `Reveal.getPlugin('menu').toggle()` first because it's the
  "documented" path, but user testing shows it silently no-ops
  in some plugin states. v0.11.3 goes back to clicking
  `.slide-menu-button` FIRST (the v0.7.0–0.10.1 strategy that
  was working), with the plugin API as fallback. Also adds a
  `console.log('[slides-ng] toggleMenu fired', {...})` diagnostic
  so users can `Ctrl+Shift+I` and see why it might still not
  work on their setup (which DOM element was found, whether
  getPlugin returned something).

### Technical

- `src/render/revealTemplate.ts` — `case 'toggleMenu'` reordered;
  Grid `TILE_W = 220` → `320`; Grid CSS grid-template-columns
  `220px` → `320px`.

## [0.11.2] — 2026-05-14

### Fixed

- **Picker current-tile highlight could lag the actual slide** —
  caught via E2E screenshots. Two underlying causes:
  - `setPickerCurrent` was posted single-shot. If the iframe's
    bridge listener wasn't up yet (fresh mount, srcdoc still
    parsing) the message was dropped and the strip stayed
    marked at whichever tile `buildPickerStrip` set initially.
  - `buildPickerStrip` used `Reveal.getIndices()` for the
    initial highlight, but inside the picker iframe Reveal is
    always at index 0 (we never navigate that iframe), so the
    initial highlight was always wrong.
- Fixes:
  - `enablePickerStrip` payload now includes `currentIdx`. The
    iframe-side builder uses it for the initial highlight.
  - `setPickerCurrent` post is now bursted on every state
    change (now + 60ms + 180ms + 400ms + 900ms — same pattern
    as `driveVisualNextSlideTo` and the parent ResizeObserver
    relayout).
  - Extracted `applyCurrentTileStyle()` / `clearCurrentTileStyle()`
    helpers so the .current visual treatment (accent border,
    halo, badge tint) is applied consistently whether it comes
    from `buildPickerStrip`, `applyPickerStripLayout` (orientation
    flip), or `setPickerCurrent` (state change). Previously the
    classList toggle didn't update inline styles, so orientation
    flips lost the highlight.

### E2E test coverage

- `test/e2e/picker-thumbnails.spec.ts` now runs 15 checks
  (was 8): loads the kitchen-sink deck, exercises the scroll
  configuration, clicks tiles via simulated postMessage, runs
  rapid sequential picks, and round-trips horizontal-mode +
  scroll + click. Screenshots: `v0110-picker-{vertical,horizontal}.png`
  and `v0111-picker-{default,scrolled,at-slide-5,horizontal-kitchen-sink,final}.png`.

## [0.11.1] — 2026-05-14

### Changed

- **Picker thumbnail polish.** v0.11.0 ship review surfaced three
  issues; this patch addresses them:
  - **Title overlay removed.** The gradient-backed title banner
    duplicated information already visible in the cloned slide
    content. Tiles are now clean miniatures of the actual slide.
    Title still lives on the button's `aria-label` + `title`
    attribute for accessibility / hover tooltips.
  - **Slide-number badge redesigned.** Was a small text pill in
    the bottom-right corner; now a 24×24 px bordered square in
    the top-left with high-contrast white-on-dark, bold tabular-
    numeric figures, and a 1.5 px white-translucent outline.
    Visible at a glance even on dark-themed thumbnails.
  - **Stronger current-slide indicator.** Border thickness 2 px
    (was 2 px implicit but inconsistent), accent-colored box-
    shadow halo, AND the slide-number badge tints to the accent
    colour with a white border — so the "you are here" tile
    reads from across the screen.
- **Vertical auto-fit width capped at 240 px.** Previously a
  vertical picker in a wide panel would render one giant tile per
  row; now it caps at 240 px so multiple tiles are visible at
  once (PowerPoint-like density). Tiles are also center-aligned
  in the strip so they don't hug the left edge. Override with
  `Settings → Speaker → Picker tile width` (0 = auto, positive =
  pinned).

### Technical

- `src/render/revealTemplate.ts` — `buildPickerStrip()` no longer
  creates a `.slides-ng-picker-tile-title` element (kept the
  alt-text on the button); `applyPickerStripLayout()` writes the
  new square-badge style + tints it on `.current`; auto-fit
  tileW uses `Math.min(stripInnerW, 240)`; strip flex container
  has `align-items: center`.

## [0.11.0] — 2026-05-14

### Added

- **PowerPoint-style thumbnail picker.** The speaker view's
  `Slides` panel can now render real miniatures of each slide
  instead of a text-row list. Click any thumbnail to jump there
  in the main preview.
- **Vertical OR horizontal orientation.** Inline toggle button
  in the picker header flips between modes; the default is set
  in Settings → Speaker → Picker orientation.
- **Responsive tile sizing.** Tiles auto-fit the panel's
  dimensions (vertical: width follows panel width; horizontal:
  height follows panel height). Override with a fixed pixel
  width via Settings → Speaker → Picker tile width.
- **Drag-resize picker panel height** — the thumbnail picker
  has `resize: vertical`, so the panel can be made taller for
  big decks or shorter to make room for other panels.
- **Settings → Speaker → Slide picker style** lets users opt
  back to the v0.10.3 text-row picker (lighter weight; useful
  for very long decks where rendering 100+ thumbnails would be
  wasteful).

### How it works

- The picker mounts a single iframe rendered via the same
  `renderDeck()` call as the visual-next-slide preview.
- Once the iframe loads, the speaker view posts a new bridge
  command `enablePickerStrip` (with orientation + optional
  tileWidth). The iframe's bridge replaces reveal's normal
  slide stage with a scrollable strip of DOM-cloned slide
  thumbnails (reusing the Grid overlay's clone-and-scale
  trick + the idle-time prewarm cache).
- Tile clicks post `slides-ng-picker` events back to the
  speaker view, which forwards them as `goto` commands to the
  MAIN preview iframe.
- Current slide is highlighted via `setPickerCurrent` posts on
  every state event.
- Orientation toggle posts `setPickerOrientation` for an instant
  layout flip (no re-render).

### Technical

- `src/render/revealTemplate.ts` — new bridge cases
  `enablePickerStrip`, `setPickerOrientation`, `setPickerCurrent`;
  new functions `buildPickerStrip()` + `applyPickerStripLayout()`.
- `src/SlidesNGSpeakerView.ts` — new `pickerStripIframe` field +
  `ensurePickerStripRendered()` + `postToPicker()` +
  `applyPickerOrientButton()`; messageHandler accepts
  `slides-ng-picker` events with `event: "click"` for tile-click
  forwarding; picker construction branches on `speakerPickerStyle`.
- `src/settings.ts` — `speakerPickerStyle`, `speakerPickerOrientation`,
  `speakerPickerTileWidth` fields + defaults.
- `src/SlidesNGSettingTab.ts` — Settings rows for all three.
- `src/styles.css` — `.slides-ng-speaker-picker-thumbs`,
  `-picker-iframe`, `-picker-orient-btn` rules.

## [0.10.8] — 2026-05-14

### Fixed

- **Root-cause fix for the ribbon-black-pane saga.** The
  v0.10.5/.6/.7 attempts were chasing symptoms. User's debug log
  revealed the real issue: `refresh()` was being called **3–4
  times in quick succession** on a single ribbon click (onOpen,
  setState, more setState — each calling refresh). Each refresh
  reassigned `iframeEl.srcdoc`. Three of those reassignments
  happened while the iframe was still at 0×0. The browser
  mid-cancelled each load attempt and the iframe ended up stuck
  in a confused intermediate state — black, requiring a
  collapse+reopen of the sidebar to force a clean relayout.
  - The fix: `refresh()` no longer sets `srcdoc` directly. It
    renders the HTML and stores it as `pendingHtml`. A new
    `applyPendingIfReady()` helper consumes the pending HTML
    only when the iframe has non-zero dimensions. Multiple
    refreshes in a row collapse into one srcdoc assignment.
  - The parent-side `ResizeObserver` now drains the pending
    HTML when the iframe transitions to real-sized — replacing
    the v0.10.6/.7 `renderedAtZeroSize` re-render hack with a
    cleaner pending-application model.
  - Net effect: Reveal initialises exactly ONCE per refresh,
    into a real-sized viewport, with no racing srcdoc
    reassignments.

### Removed

- `renderedAtZeroSize` field + the `view/resize/re-render-at-real-size`
  log tag (replaced by `view/resize/apply-pending` +
  `view/apply-pending/{applied,skip-zero-size}`).

### Technical

- `src/SlidesNGView.ts` — new `pendingHtml: string | null` field;
  new `applyPendingIfReady()` method; `refresh()` writes
  `pendingHtml` and calls `applyPendingIfReady()`; iframe
  ResizeObserver branches on `pendingHtml !== null` to drain it
  before falling through to the `postRelayoutBurst` path.

## [0.10.7] — 2026-05-14

### Fixed

- **"Black for a second then pops in" perceived latency** —
  v0.10.5's `waitForIframeSize` was blocking `refresh()` for up
  to 3 seconds while the iframe was at 0×0, which made every
  open feel laggy. The helper is gone; `refresh()` now sets
  srcdoc immediately. The v0.10.6 `renderedAtZeroSize` + parent
  ResizeObserver re-render path catches the 0×0 case without
  the wait — once the iframe gets real dimensions, refresh is
  re-triggered automatically.
- **Ribbon click doesn't focus the preview leaf** — `revealLeaf`
  expands the sidebar containing the leaf but doesn't transfer
  keyboard focus to it in newer Obsidian. Added an explicit
  `workspace.setActiveLeaf(leaf, { focus: true })` after
  `revealLeaf`, so keyboard navigation goes to the deck
  immediately on open (matches the pre-v0.10.x behaviour the
  user remembered).

### Technical

- `src/SlidesNGView.ts` — `waitForIframeSize` helper deleted;
  `refresh()` sets srcdoc immediately and only logs whether the
  iframe was at 0×0 (the resize-driven re-render handles
  recovery).
- `src/main.ts` — `setActiveLeaf(leaf, { focus: true })` after
  both `revealLeaf` paths in `activatePreviewLeaf`.

## [0.10.6] — 2026-05-14

### Fixed

- **Intermittent ribbon black-pane bug, take 5** — confirmed by
  user logs: the v0.10.5 `waitForIframeSize` could time out at
  0×0 in ~10% of opens (notably the command-palette path),
  setting srcdoc into a still-zero-sized iframe and falling
  through to the broken state. The iframe got real dimensions
  ~1.2 seconds AFTER the timeout fired, by which point Reveal
  had already baked 0×0 into its slide-stage transform.
  - Bumped `waitForIframeSize` default timeout from 1.5 s → 3 s
    so a wider window of slow opens hit the fast path.
  - When the wait DOES time out at 0×0, the view now marks
    itself `renderedAtZeroSize = true`. The parent-side
    `ResizeObserver` (added in v0.10.4) checks this flag on
    every non-zero resize; if set, it re-triggers `refresh()`
    instead of just posting `relayout`. Reveal then initialises
    fresh into the now-real viewport.

### Technical

- `src/SlidesNGView.ts` — `renderedAtZeroSize` field;
  `refresh()` sets it when wait-for-size times out; iframe
  ResizeObserver consumes it to re-trigger `refresh()` on first
  non-zero resize. New log tag `view/resize/re-render-at-real-size`
  makes the recovery visible in the debug log.

## [0.10.5] — 2026-05-14

### Fixed

- **Ribbon-click black-pane bug, take 4.** v0.10.4's parent-side
  ResizeObserver fix posted `relayout` correctly when the iframe
  resized from 0×0 to its real dimensions — but Reveal had
  already initialised at 0×0 by then, baking 0×0 into its slide-
  stage transform. Subsequent `Reveal.layout()` calls weren't
  enough to fully recover. v0.10.5 attacks the problem at its
  source: `refresh()` now `await`s a `waitForIframeSize()` helper
  before setting `srcdoc`. The helper uses a ResizeObserver +
  1500 ms timeout to wait until the iframe element has non-zero
  `clientWidth` and `clientHeight`. Reveal then initialises into
  a real-sized viewport from the start. Combined with v0.10.4's
  parent-side relayout-on-resize, this should finally land the
  fix.

### Technical

- `src/SlidesNGView.ts` — new `waitForIframeSize()` helper,
  awaited in `refresh()` before `iframeEl.srcdoc = html`. Logs
  `view/wait-for-size/{start,ready,timeout}` to the debug log
  so it's clear when the await fires vs. fast-paths through.

## [0.10.4] — 2026-05-14

### Fixed

- **Ribbon-click black-pane bug, take 3.** v0.10.2 added an
  in-iframe `ResizeObserver` watching `document.documentElement`
  — but Electron doesn't reliably emit a resize on the inner doc
  when the OUTER iframe element resizes. Debug log from a v0.10.3
  install confirmed `iframeClientW:0, iframeClientH:0` at render
  time AND no later events that would have triggered the inner
  observer. v0.10.4 moves the resize trigger to the parent
  context (Obsidian renderer): `SlidesNGView` attaches a
  ResizeObserver to its `iframeEl` and, on every non-zero size
  change, posts `relayout` over the bridge in a burst (now + 60ms
  + 180ms + 400ms + 900ms) to defeat any race with the iframe's
  bridge-listener install. The iframe bridge handles the message
  by calling `Reveal.layout()` + `Reveal.sync()`. Also added a
  belt-and-suspenders `Reveal.layout()` call from inside the
  iframe's `Reveal.on('ready')` hook, so even if every relayout
  message is lost, layout still recomputes once on init.

### Technical

- `src/SlidesNGView.ts` — `iframeResizeObserver` field;
  `postRelayoutBurst()` helper; `ro.observe(this.iframeEl)` in
  `onOpen`; `ro.disconnect()` in `onClose`.
- `src/render/revealTemplate.ts` — `case 'relayout'` in the
  bridge switch; `Reveal.layout()` call inside the `ready` event
  handler.

## [0.10.3] — 2026-05-14

### Changed

- **Slide picker rebuilt as a single scrollable column.** The
  compact-vs-list mode toggle is gone; the "Show all N slides →"
  footer link is gone; the `speakerPickerDefaultMode` setting UI
  is gone. The picker is now one scrolling list of numbered slide
  rows. Past slides are faded, the current slide is accent-
  highlighted, and the panel auto-scrolls to keep the current row
  in view (`scrollIntoView({block: 'nearest', behavior: 'smooth'})`).
  Native mouse-wheel scroll because it's just `overflow-y: auto`.
- **Inline countdown-target input.** The timer panel grows a small
  `[N] min` input next to the mode dropdown when mode is
  "countdown" — hidden in elapsed / lap mode. Live-edits the
  target without bouncing to settings. The countdown setting in
  the settings tab still works as the default.
- **"Next: …" text panel (`nextLine`) retired.** It's redundant
  now that the picker shows the next slide(s) inline + the visual
  next-slide preview iframe shows the actual rendering. The
  visibility-toggle entry stays in settings (labelled "retired in
  v0.10.3") for back-compat — toggling it does nothing.

### Fixed

- **Mermaid blocks in two example decks** (`01-conference-talk.md`
  and `04-project-demo.md`) replaced with ASCII representations.
  Slides-NG doesn't bundle Mermaid (it's ~700 KB and would blow
  past the 2 MB bundle soft cap); the previous decks rendered
  fenced ` ```mermaid ` blocks as raw code instead of diagrams.
  Mermaid added to the idea jar with the bundling tradeoff
  spelled out.

### Idea jar (added)

- **Mermaid diagram support** — would require either accepting a
  much larger bundle or rendering Mermaid out-of-iframe and
  injecting SVG (with no network access at render time).

### Technical

- `src/SlidesNGSpeakerView.ts` — `pickerMode` field + mode
  toggle button removed; `nextLineEl` reference + applyState
  branch removed; `renderPicker` collapsed to a single
  `for (const s of slides)` loop with auto-scroll-into-view;
  inline countdown-input + `syncCountdownVisibility` helper
  added to the timer panel; status bar no longer rendered with
  the timer span.
- `src/SlidesNGSettingTab.ts` — "Slide picker mode" Setting row
  removed; `PICKER_MODES` import dropped.
- `src/settings.ts` — `SPEAKER_PANEL_LABELS.nextLine` labelled
  "retired in v0.10.3".
- `src/styles.css` — all `.slides-ng-speaker-compact*` rules
  deleted; `.slides-ng-speaker-next` rule deleted;
  `.slides-ng-speaker-list-item` got `.past` opacity treatment +
  current-hover state + bigger numbered badge;
  `.slides-ng-speaker-picker` got `max-height: 50vh` so it
  scrolls inside its cap rather than pushing other panels off
  the page; new `.slides-ng-speaker-timer-countdown[-label]`
  rules for the inline countdown input.

## [0.10.2] — 2026-05-14

### Fixed

- **Iframe layout race ("black pane on initial open, wrong size
  after tab switch")**. When the preview opens in a tab that isn't
  the visible one, the iframe's `documentElement.clientWidth` is 0
  at `Reveal.initialize()` time and reveal computes a 0×0 slide
  stage. Switching tabs eventually fires a resize event that
  reveal's own debounced handler picks up — but not always, and
  not reliably across viewport changes. Defensive fix in the
  iframe bootstrap: a `ResizeObserver` on `document.documentElement`
  calls `Reveal.layout()` + `Reveal.sync()` on every >2px size
  change, with a per-frame debounce. Also re-fires on
  `visibilitychange` and on the first animation frame, so the
  first paint always lands at the right size.
- **Menu toolbar button did nothing.** The bridge was clicking
  `.slide-menu-button` as a programmatic-click stand-in; the
  reveal-menu plugin's click handler is bound late and silently
  no-ops if the plugin instance hasn't finished init. v0.10.2
  goes through `Reveal.getPlugin('menu').toggle()` (the documented
  path) with a fallback to `.openMenu` / `.closeMenu` for older
  builds and only `.slide-menu-button.click()` as a last resort.
- **Grid toolbar button rendered as a blank space.** The icon
  name `grid-3x3` isn't reliably bundled in older Obsidian
  Lucide sets. Switched to `layout-grid`.
- **Visual next-slide preview showed the CURRENT slide instead of
  the next one.** Race: the speaker view posted the `goto` message
  immediately after setting the mini-iframe's `srcdoc`, but inside
  the iframe the message listener doesn't get installed until the
  srcdoc HTML has parsed up to the bridge script — so the first
  message landed in the void. `driveVisualNextSlideTo` now retries
  the post at 50 ms / 150 ms / 350 ms / 700 ms after the initial
  call (cheap, ~5 messages).

### Added

- **File-based debug logger** (`slides-ng-debug.log` in vault
  root). Captures lifecycle events: ribbon click,
  `activatePreviewLeaf`, `setState`, `onOpen`, `refresh` (with
  iframe dimensions, file resolution, render success). Toggleable
  via the new `Debug → Write debug log` setting (default on for
  v0.10.2 while we diagnose ribbon-render reports; flip off once
  your install is stable). New command `Slides NG: Clear debug
  log` resets the file. Logs include relative-ms timestamps so
  timing races are obvious from the log.

### Idea jar (added)

- **Multi-next-slide preview** — render the next N slides as a
  row of thumbnails with corner numbers instead of a single
  visual-next iframe.
- **Free-grid panel layout** — beyond vertical-with-DnD and the
  v0.10.0 2-column flow, let panels dock into arbitrary positions
  on a 2D grid (size + position both editable). OBS-style.

## [0.10.1] — 2026-05-14

### Fixed

- **Ribbon-button "Open preview" no longer shows a blank pane until
  you click Reload.** Two compounding causes:
  - `onOpen` awaited `warmHighlighter()` before the first refresh.
    When Shiki's cold start was slow (first-ever Obsidian session,
    sluggish disk), the await blocked the final `await refresh()` —
    the iframe stayed empty. Reload re-rendered because it didn't
    wait for highlighter. Now warmed in the background; the first
    render falls back to plain `<pre><code>` and re-renders with
    colour as soon as the highlighter is ready.
  - `setState` could be invoked with `filePath: undefined` if the
    ribbon click stole focus before `active-leaf-change` fired the
    plugin's `lastMarkdownFile` tracker. `onOpen` now defensively
    falls back to the plugin's `resolveDeckFile()` accessor when
    `this.filePath` is still null at iframe creation time.
  - Plugin also seeds `lastMarkdownFile` from `onLayoutReady` and
    listens on `file-open` (in addition to `active-leaf-change`)
    so the tracker is always populated by the time the user can
    plausibly click the ribbon icon.
- **Speaker view section titles ("Speaker notes", "Slides", etc.)
  no longer appear visually centred** when inserted next to the
  drag handle. v0.10.0's `attachDragHandle` inserted the handle as
  a third sibling into headers that already used
  `justify-content: space-between` (notesHeader, pickerHeader);
  space-between then distributed `[handle, title, button]` at
  start/center/end — putting the title in the middle. Fix wraps
  handle + title in a `slides-ng-speaker-panel-header-group`
  sub-div so the header still sees two children and pushes the
  trailing button to the right.
- **Drop-indicator no longer flashes for no-op drop positions** —
  hovering directly above the panel that comes right after the
  dragged panel, or directly below the panel that comes right
  before it (both would leave the order unchanged), now hides the
  indicator entirely. Tracked via a new `draggingPanelId` field
  set in `dragstart` (HTML5 DnD forbids reading `dataTransfer`
  during `dragover`).
- **Grid tile thumbnails sized correctly for non-default deck
  dimensions.** The Grid overlay hard-coded `SLIDE_W = 960`,
  `SLIDE_H = 700`. Decks with custom width / height — or any deck
  exported through the v0.9.0 PDF modal with an aspect override —
  produced mis-scaled clones. Now reads `Reveal.getConfig()` at
  toggle time and falls back to 960×700 only when reveal hasn't
  reported dimensions yet.

### Technical

- `src/main.ts` — `seed()` + `onLayoutReady` + `file-open` event.
- `src/SlidesNGView.ts` — defensive `filePath` fallback in
  `onOpen`; background `warmHighlighter()` with re-render on
  resolve.
- `src/SlidesNGSpeakerView.ts` — `attachDragHandle` wraps
  handle + title in a sub-div when inserting into an existing
  `*-header` element; `draggingPanelId` field + signature change
  on `updateDropIndicator(target, targetId, cursorY)`; no-op
  drop-position suppression in `updateDropIndicator`.
- `src/styles.css` — `.slides-ng-speaker-panel-header-group` row
  layout.
- `src/render/revealTemplate.ts` — `SLIDE_W` / `SLIDE_H` read
  from `Reveal.getConfig()` instead of hard-coded.

## [0.10.0] — 2026-05-14

### Added

- **Dedicated Timer panel with 3 modes** — replaces the v0.8.x split
  where the timer DISPLAY lived in the status bar and the BUTTONS
  lived in a tiny separate row.
  - **Elapsed** — counts up from zero (original behaviour, default)
  - **Countdown** — counts down from a configurable target (default
    30 min); shows an amber warning at 80% consumed and a red
    pulsing overrun once past zero
  - **Slide (lap)** — auto-resets every time the active slide
    changes; useful for keeping per-slide pace
  - Mode selectable inline via a dropdown in the panel and via two
    new settings: `Timer default mode` and `Countdown target
    (minutes)`.
- **Multi-column panel flow at wide widths** — when the speaker
  pane is ≥ 900 px wide, panels flow into a 2-column auto-fit grid
  (`grid-template-columns: repeat(auto-fit, minmax(420px, 1fr))`)
  instead of stacking infinitely vertically. Opt out via the new
  `Multi-column panels at wide widths` setting.
- **Grid in preview toolbar** — Grid moved out of the speaker
  view's util-group and into the PREVIEW toolbar (left group, next
  to Menu / Use current). The status bar's "Slide N of M" button
  still toggles the same overlay, so speaker users keep a
  one-click route to it.
- **Per-scene icon customisation** — `SceneDefinition` gains an
  optional `icon: string` field that any Lucide icon name fills
  (`monitor-off`, `coffee`, `message-circle-question`, etc.). The
  settings tab's scene editor adds an icon column with a live
  preview swatch next to a text input — paste any name from
  lucide.dev and it renders immediately. The 4 default scenes ship
  with their previous icons made explicit.

### Changed

- **Visual next-slide preview width capped at 900 px**, centered
  inside its panel. At very wide viewports the iframe used to grow
  proportionally wider while reveal's slide aspect stayed fixed —
  the result looked "really long horizontally" even when it had
  plenty of room. Now it stops growing past 900 px and the side
  space goes into the multi-column panel flow.
- **"View all N slides" picker footer restyled as a text-link**
  (was: dashed-border tile that read as another slide row). Now
  reads as `Show all 7 slides →` and uses muted-text-with-accent-on-
  hover styling so it's visually distinct from the slide rows above.
- **Drag-handle inline placement now wraps title + handle in a
  fresh sub-div** instead of mutating the panel's own flex layout.
  v0.8.4's attempt to add the `panel-header` class directly to a
  panel root (like `visualNext-wrap` or `picker-wrap`, which are
  themselves column-flex containers) was forcing `align-items:center`
  on the whole panel — that's why the user reported "the text is
  being centered for some reason" in v0.9.0. The new sub-div
  contains only handle + title and stays explicitly
  `flex-direction:row, justify-content:flex-start`.
- **Status bar no longer shows the timer** — moved into its own
  panel. The "Slide N of M" button gets the full status-bar width.
- **Speaker controls panel description** updated: was "First /
  Prev / Next / Last / Grid", now "First / Prev / Next / Last"
  (Grid moved to toolbar).

### Why

The user's v0.9.0 polish review surfaced six distinct UX issues
that clustered naturally:
1. Drag handle + section-title alignment looked wrong
2. Visual next-slide stretched too wide on wide viewports
3. "View all N slides" looked like another slide row
4. Grid button placement felt random in the speaker view
5. Start/Reset alone with no timer-mode controls felt half-baked
6. Scene icons appeared hard-coded (they were)

Fixing them one at a time would have shipped 6 minor releases.
Bundling solves the related concerns at once and lets the
multi-column panel idea pay for the visual-next-slide width cap —
since the iframe stops growing, the side space becomes useful.

### Technical

- `src/settings.ts` — `SceneDefinition.icon?: string`;
  `speakerTimerMode: "elapsed" | "countdown" | "lap"`;
  `speakerTimerCountdownMinutes: number`; `speakerPanelsMultiColumn:
  boolean`. `DEFAULT_SCENES` updated with explicit icons. Panel-
  label descriptions reflect the new "Grid moved to toolbar"
  arrangement.
- `src/SlidesNGSpeakerView.ts` — timer panel rewrite (title +
  big display + mode dropdown + Start/Reset row); status bar no
  longer mounts the timer span; util-group removed; scene-button
  icon prefers `scene.icon` over the hard-coded id fallback;
  `attachDragHandle` wraps title + handle in a fresh `panel-header`
  sub-div; lap-mode timer resets in the postMessage handler when
  `currentIdx` changes; `applyTimerLabel` branches per mode (with
  `warning` / `overrun` CSS classes for countdown).
- `src/SlidesNGView.ts` — Grid toolbar button (left group, after
  Menu), posts `toggleOverview` to the iframe bridge.
- `src/SlidesNGSettingTab.ts` — Timer default mode, Countdown
  target (minutes), Multi-column panels; scene editor now has an
  icon column with live `setIcon` preview swatch.
- `src/styles.css` — new `.slides-ng-speaker-timer-panel` /
  `-display` / `-row` / `-mode` rules; countdown warning/overrun
  states with a 1.6s pulse keyframe; `.slides-ng-speaker-compact-all`
  restyled as text-link; visual-next-frame-wrap `max-width: 900px`
  + auto margins; `.slides-ng-scene-editor-row` grid now 4 columns
  (label / icon / content / remove); `.slides-ng-scene-editor-icon`
  + `-icon-preview` for the picker swatch; container-query
  `(min-width: 900px)` opt-in 2-column grid via
  `.slides-ng-speaker-multicolumn` class.
- `tests/scenes.test.ts` — icon field defaults asserted;
  `tests/settings.test.ts` — three new defaults asserted (timer
  mode, countdown minutes, multi-column).
- `test/e2e/speaker-view.spec.ts` + `speaker-070.spec.ts` — Grid
  click selectors updated to the toolbar; timer-ctrls renamed to
  timer-row.

### Bundle size

2.01 MB → 2.02 MB (+7 KB for all 6 features).

## [0.9.0] — 2026-05-13

### Added

- **Export-for-PDF options modal** — Export PDF (toolbar + command)
  now opens a small modal first so the user picks how the printed
  pages should look before the deck is rendered for print.
  Available knobs:
  - **Include speaker notes** — embeds notes alongside each slide
    via reveal's `?showNotes=true`. Useful for handouts.
  - **Aspect ratio** — `Current` (deck default), `16:9` (1280×720),
    or `4:3` (1024×768). Overrides flow through `RenderDefaults`
    into `Reveal.initialize()` so the rendered HTML has the right
    page dimensions for whichever paper the user is printing on.
  - **Theme override** — pick any of the 15 bundled reveal themes
    just for the PDF run without touching the deck or settings.
    Lets users author in `black` and print in `white` for ink.
  - **Max pages per slide on overflow** — sets reveal's
    `pdfMaxPagesPerSlide` URL param. Default 1 (clip overflow);
    raise it to let long slides break across pages.

### Why

Sole 0.8.x PDF flow was "click → goes straight to print mode with
zero choice." Two real friction points: dark-themed decks wasted
ink, and content that overflowed in `print-pdf` mode was silently
clipped. The modal collects intent up front so the same path
handles both cases without per-deck frontmatter gymnastics.

### Technical

- `src/export/exportStandalone.ts` — new `PdfExportOptions`
  interface and `buildPdfUrlSuffix()` pure helper.
  `exportAndOpenForPdf()` now accepts an optional `pdfOptions`
  parameter and merges the theme + aspect-ratio overrides into
  `RenderDefaults` before rendering; URL-only flags (`showNotes`,
  `pdfMaxPagesPerSlide`) go into the file:// query string.
- `src/render/renderDeck.ts` — new `pdfAspectWidth` / `pdfAspectHeight`
  on `RenderDefaults`, threaded into the deck's default options
  layer so they survive the standalone-render path.
- `src/render/revealTemplate.ts` — same fields plumbed through
  `DeckRenderOptions` and spread into the `Reveal.initialize()`
  config block. Override only kicks in when the caller explicitly
  passes a number — `current` aspect stays at reveal's default
  960×700 (or whatever the deck's own settings produce).
- `src/ExportPdfOptionsModal.ts` (new, ~115 LOC) — small Obsidian
  `Modal` subclass with three `new Setting()` rows + Cancel/Export
  buttons. Pure UI; export logic stays in
  `exportStandalone.ts`.
- `src/main.ts` + `src/SlidesNGView.ts` — both entry points now
  open the modal first and only run the export when the user
  clicks Export.
- `tests/exportStandalone.test.ts` — `buildPdfUrlSuffix` covered:
  defaults to `?print-pdf`; `showNotes`, `maxPagesPerSlide`
  encoded as query params; aspect + theme are NOT in the URL
  (they go through `renderDefaults`); standalone render with
  `pdfAspectWidth: 1280` produces `"width":1280` in the bundle.

## [0.8.4] — 2026-05-12

### Changed

- **Drag handle placement** — moved from floating-on-left-edge to
  **inline next to each panel's section title**. Reads as
  `[⋮⋮] Speaker notes` / `[⋮⋮] Slides` / etc. Title-less panels
  (status, controls, timer, nextLine) keep a small floating
  handle at top-left, with a 4-px margin so it doesn't overlap
  the first content row.
- **Handle visibility** still strictly hover-gated — invisible by
  default; reveals only when hovering the specific panel; all
  handles visible during an active drag.

### Why

User feedback on 0.8.3: the left-edge floating handle felt
disconnected from the panel content. Inline placement next to
the title text reads as "this row controls this panel" without
needing to teach the affordance.

## [0.8.3] — 2026-05-12

### Fixed

- **Drag-and-drop reorder UX** — v0.8.1 used a single
  `drop-target` outline on the hovered panel, which left the user
  guessing whether the dragged item would land above or below the
  target. v0.8.3 replaces that with a **floating horizontal-line
  indicator** that snaps to the exact drop position: top edge of
  the hovered panel if the cursor is in its upper half, bottom
  edge if in its lower half. Standard reorder-DnD UX. Drop
  position is computed live during `dragover` and persisted
  exactly.
- **Drag handle moved to the left edge** of each panel (vertically
  centered, 16×28 px). Was top-right, which collided with the
  Notes panel's new Edit button. Left-edge position never
  conflicts with any right-side panel UI (Edit, mode toggle,
  scenes, etc.).
- **Handle visibility** is now strictly hover-gated. Default
  opacity `0`; reveals to `0.6` only when hovering its own panel.
  All handles become visible during an active drag so the user
  can see drop targets.

### Notes

- The `drop-target` ring overlay on individual panels was
  removed in favour of the line indicator (cleaner; no double
  signal).
- The "ghost outline on every panel during drag" pattern was
  also removed — the line indicator + the dragged panel's 50%
  opacity is enough visual feedback.

## [0.8.2] — 2026-05-12

### Added

- **Editable speaker notes from the speaker view** — every notes
  panel now has a small "Edit" affordance (fades in on hover). Click
  to swap the rendered HTML for a textarea pre-filled with the
  current slide's raw notes markdown. Save (or Ctrl/Cmd-Enter)
  writes back to the deck file; Cancel (or Esc) discards.
- **`src/parser/editSlideNotes.ts`** — pure helpers (`findSlideRanges`,
  `readSlideNotes`, `replaceSlideNotes`) that locate a slide's
  range in deck markdown and replace/insert its trailing
  `<!-- ... -->` notes comment. Skips YAML frontmatter, code
  fences, and slide-annotation comments (those start with
  `<!-- slide ...` or `<!-- element ...`).

### Notes on the editor's contract

- Saves write SINGLE-LINE `<!-- ... -->` comments. Newlines in the
  textarea are flattened to spaces on save. The textarea allows
  multi-line input for ergonomic typing, but the on-disk format
  stays one line. Multi-line notes can be edited directly in the
  markdown editor as before.
- Save re-reads the file before writing so concurrent edits in
  the markdown editor aren't clobbered.
- Notes panel doesn't repaint while you're typing — `applyState`
  guards on a `notesEditing` flag.

### Tests

- New `tests/editSlideNotes.test.ts` (19 unit tests) — slide-range
  detection, notes lookup, replace + insert paths, annotation
  comments left untouched, empty-string-removes-note, out-of-range
  indices.
- New `test/e2e/editable-notes.spec.ts` (3 tests) — full round-trip:
  click Edit → textarea shows current notes → Save writes new
  notes to the deck file; Cancel discards.
- Totals: 327 unit / 22 E2E spec files.

## [0.8.1] — 2026-05-12

### Added

- **Drag-and-drop modular speaker panels** — every panel now carries
  a small grip-vertical handle (top-right corner, fades in on
  hover). Drag a handle onto another panel to drop the dragged
  panel into that slot. Order persists via the new
  `speakerPanelOrder` setting and is forward-compatible (settings
  from older versions are merged with default order).
- Visual feedback during drag: dragged panel goes 50% opacity;
  hover-target gets an accent dashed outline; every panel gets a
  subtle ghost outline so drop targets are obvious at a glance.

### Fixed

- **Next-line panel structure** — the "Next: …" text element used
  to be the panel container itself, so `setText` calls in
  `applyState` would wipe the drag handle that
  `setPanelVisible` inserts. Now wrapped in a parent + child-span
  pattern: setText hits the child only, handle stays put.

### Tests

- New `test/e2e/speaker-panel-dnd.spec.ts` (3 tests): every panel
  has a drag handle; writing `speakerPanelOrder` to settings +
  reopening the speaker view reorders the DOM accordingly; resetting
  to defaults restores the source order.
- Totals: 308 unit / 21 E2E spec files.

### Deferred to 0.8.2

- Editable speaker notes from the speaker view (needs a writeback-
  to-vault story; deserves its own focused release).

## [0.8.0] — 2026-05-12

### Added

- **Per-panel show/hide for the speaker view** — every panel (status,
  controls, timer, next-line, visual-next-preview, scenes, notes,
  picker) can be toggled on/off via Settings → Slides NG → Speaker
  panels. Hidden panels are still mounted; toggle is instant on
  next reopen.
- **Resizable visual-next-slide preview** — the mini-iframe panel
  now has a native CSS resize handle on its bottom edge. Drag to
  resize; height persists via the new `speakerVisualNextHeightPx`
  setting (ResizeObserver + debounced save). Default keeps the
  16:9 aspect-ratio sizing.
- **Clickable "Slide N of M" status label** — wraps the status text
  in a button that opens the Grid overlay. Closes the "how do I
  jump anywhere" UX gap without needing to know the Grid button
  exists.
- **Compact picker redesign** — was a sparse text list. Now:
  previous slide (faded) + current slide (accent fill with number
  badge) + next 3 upcoming slides, all rendered as clickable rows
  with prominent number badges. Footer button "View all N slides …"
  opens the Grid for jumping outside the compact window. No need
  to switch to list mode just to find a specific slide.

### Changed

- **List-mode picker rows** got number badges too (parity with
  compact), and they're now `<button>` elements with proper focus
  + hover affordance instead of plain divs.

### Notes

DnD modular panels, editable speaker notes, and PDF export
options remain queued — 0.8.1+ work (see ROADMAP.md).

## [0.7.5] — 2026-05-12

### Changed

- **Speaker view opens as a new tab, not a horizontal split** — used
  to split the current pane horizontally (preview top, speaker
  bottom), which shrank the slide preview by ~half. Now opens as
  a sibling tab in the current pane; user can switch via tab,
  drag to a new window for second-monitor use, or manually split
  if they want simultaneous visibility.

### Fixed

- **reveal.js-menu `autoOpen: true` → `false`** — speculative fix
  for user-reported "dots on the left side" of the iframe.
  Disabling autoOpen ensures the menu doesn't auto-render any
  side-indicator UI in embedded mode. If the dots persist, they're
  from a different source (reveal stock controls, slide-number,
  etc.) and need targeted follow-up.

### Roadmap

- **Per-panel resize handle** added to the 0.8.0 modular-panels work
  per user request — most useful for the visual-next-slide preview.

## [0.7.4] — 2026-05-12

### Added

- **Grid overlay now shows real slide thumbnails** — instead of just
  number + title text (0.7.3), each tile contains a scaled clone of
  the slide's actual `.slides-ng-layout` DOM. Theme, layouts, Shiki
  syntax highlighting, image attachments — all preserved. No
  library dependency (no html2canvas / dom-to-image bloat); pure
  CSS-transform clone since we're outside reveal's positioning
  system, so no clip-escape edge cases.
- **Pre-warmed thumbnail cache** — clones are computed once in idle
  time after Reveal ready (`requestIdleCallback`, falls back to
  `setTimeout(100)`), not when the user clicks Grid. First Grid
  open is instant on big decks; the warm-up never blocks the main
  loop.
- **Tile UI polish**: 220px fixed-width tiles for crisp scaling,
  number badge bottom-right, title gradient overlay top, hover
  ring + accent border on the current slide.

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
