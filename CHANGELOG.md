# Changelog

All notable changes to this project will be documented in this file. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
