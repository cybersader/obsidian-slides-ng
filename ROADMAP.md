# slides-ng — roadmap + idea jar

What's coming, in rough order of intent. This is a working document — items
move between sections as work happens. Released versions live in
[CHANGELOG.md](./CHANGELOG.md).

## In flight

### 1.0.0 (tentative) — reverse-follow + presenter overlays + slide-range PDF

- **Reverse follow** — preview → editor cursor. Fires only on horizontal `slidechanged`, never on fragment events (where Slides-Extended jittered)
- **Presenter overlay tools** — drawing layer, laser pointer, color swatches (Slides-Extended parity)
- **PDF slide-range** — extend the 0.9.0 modal with a slide-range field so users can print a subset (e.g. `1-5,8` for handouts of the intro + the final summary)

## Shipped

See [CHANGELOG.md](./CHANGELOG.md) for the full release-by-release delta.
Most recent:

- **0.11.29** — frontmatter ref card gets per-section copy buttons + a "Copy all sections" button for one-click sharing with an AI agent. Plus icon-tool button border rules use `!important` to defeat opinionated theme overrides (Minimal, Things, etc.) — vanilla Obsidian was already clean per WDIO screenshots.
- **0.11.28** — picker header buttons no longer touch the iframe container below. Added `margin-bottom: 0.4rem` on the header (the picker-wrap uses block flow, not flex with gap, so without this the borderless icon buttons sat flush against the picker container's top edge).
- **0.11.27** — panel-header icons are now truly borderless at rest (was `border-color: transparent`, still allocated 1 px width). Hover gives a soft rounded-square (6 px radius) background — the only visual affordance. Notes Edit becomes icon-only (pencil + tooltip) to match the picker chrome.
- **0.11.26** — panel-header buttons (picker orientation + magnifier + notes Edit + drag/hide group) redesigned as a minimal icon toolbar: 24-px transparent icon-only buttons with subtle hover background, plus a compact-pill modifier for icon+label buttons that keeps the label visible at every pane width. Reads as secondary chrome instead of competing with the section title.
- **0.11.25** — picker resize no longer stalls / leaves cursor stuck. CSS `resize: vertical` got blocked by the picker iframe's pointer events; replaced with a custom drag handle that uses Pointer Events + `setPointerCapture` so nothing below it can interrupt the drag. Handle is subtle (3 px transparent strip, faint accent on hover) per user feedback. New `speakerPickerHeightPx` setting persists the drag across sessions. WDIO spec adds a resize-handle test that dispatches synthetic pointer events and asserts the container height changes.
- **0.11.24** — up-next iframe flicker fix. Same burst-timer cancellation pattern as the v0.11.21 picker fix applied to `driveVisualNextSlideTo`. WDIO spec adds an `up-next iframe stability` test that installs a MutationObserver inside the up-next iframe and fires two rapid navigations — asserts ≤5 `.present` transitions (catches the burst-leak regression).
- **0.11.23** — magnifier preset now affects horizontal-strip mode too (preset = tile width, height = preset × aspect, clamped to strip height). compact/comfortable/big produce visibly different tile widths in horizontal mode whenever strip height has room. WDIO spec adds a horizontal-magnifier test that forces 320 px container height and asserts ≥3 distinct widths emerge across presets.
- **0.11.22** — picker overhaul: (a) magnifier works in vertical-1 / vertical-2 / auto via a unified `min(preset, columnWidth)` sizing model — orientation just caps column count, leftover centers; (b) vertical-1 tiles no longer compressed to 4 px tall (`flex: 0 0 auto` on every flex-mode tile); (c) dedicated per-strip ResizeObserver inside the iframe so the picker reflows on viewport change without needing to cycle modes (the old global RO had a 2-px size-delta guard that swallowed sub-perceptual resizes); (d) auto-fit preset is now real tile width (not min cell size) so comfortable / big visibly differ even at narrow strips; (e) new WDIO viewport-responsiveness test resizes the picker container 200→700 px and asserts column count changes without manual rebuild.
- **0.11.21** — auto-mode magnifier actually works now. Pixel-pin tile dimensions in auto mode too (column count = `Math.floor(strip / minCell)`, tile = `strip / cols`) — drops the aspect-ratio + ResizeObserver workaround that v0.11.20 added but which still raced inside `<button>` grid items. Plus: picker current-tile indicator no longer flips back to the previous slide after navigating (state-event burst's stale posts were overwriting the new highlight — burst timer IDs tracked + cleared on each new state event). Added a WDIO spec that drives every (4 orientation × 4 magnifier) combination and asserts no tile's scaled content overflows its container.
- **0.11.20** — picker tile content overlap robustness fix. Adds a ResizeObserver per tile that re-scales the inner content whenever the tile's actual rendered width changes — bypasses every race (reveal.js cascade, post-rAF mistiming, strip-level relayout stomping inline styles) that v0.11.18/v0.11.19 still had narrow windows on.
- **0.11.19** — hotfix on top of v0.11.18: picker tiles in fixed-column modes (vertical-1 / vertical-2 / horizontal) no longer overflow their borders. The width:100% + aspect-ratio + post-rAF measure approach raced against iframe layout in some cases (slide titles spilled out at full slideW). Reverted those modes to pixel-pinned tile sizes; only `auto` mode keeps the aspect-ratio dance because its tile widths really do come from CSS grid auto-fill.
- **0.11.18** — bug bundle. (a) Speaker notes box now renders newlines after save: `renderDeck` had been using CommonMark-default marked for everything; notes now use a separate `Marked({ breaks: true, gfm: true })` instance so multi-line `<!--\n...\n-->` notes display with `<br>`s. (b) Picker tile sizing in fixed-column modes (1-col / 2-col / horizontal) no longer leaves empty black space — tiles fill their cell, magnifier preset is ignored in those modes. (c) `auto` orientation is now a real `auto-fill` CSS grid using the magnifier preset as MIN cell width (the "maximize columns" mode), and re-applies on speaker-pane resize via the existing ResizeObserver hook.
- **0.11.17** — magnifier-cycle button on the picker header: cycles tile size through three presets (compact 100 px / comfortable 180 px / big 280 px) so users can scale picker real-estate inline. Per-deck override via `slides-ng-picker-tile-width: comfortable` (alias) or `: 220` (raw pixels) frontmatter. Auto remains the install default (not in the cycle — reachable via Settings). New `peekFrontmatterRaw` parser helper underpins the value lookup; the boolean `peekFrontmatterFlag` is now a thin shim.
- **0.11.16** — bug bundle + layout tweak. (a) Speaker notes save no longer strips newlines: multi-line input is now written as the slidev convention `<!--\n...\n-->` (one multi-line comment); reader supports both forms. (b) Picker orientation 2-col / auto modes actually apply now — the iframe-side bridge had been silently dropping anything that wasn't `horizontal` or legacy `vertical`, so the cycle button changed icon but the strip stayed in 1-col. (c) Drag handle + hide button moved to the RIGHT of each panel title row.
- **0.11.15** — picker layout: 4 modes (vertical-1, vertical-2, horizontal, auto) with cycle toggle in the picker header; inline panel-hide button on every speaker-view panel (eye-off icon on hover) + "Show all" button when any panel hidden; per-slide panel-visibility override via `slides-ng-hide-panels: [picker, scenes]` frontmatter that the speaker view applies temporarily while that slide is current and restores on navigation.
- **0.11.14** — bug bundle. Notes Save now works on auto-h1-breaks decks (findSlideRanges peeks the flag); Grid overlay responsive on narrow viewports; up-next iframe drag-resize floor is consistent from the start (40px instead of 80px); picker iframe strip-mode recovery via bridge-ready postback + extended burst retries. Plus 3 example decks demonstrating the ☰ hamburger menu config.
- **0.11.13** — thumbnail fidelity + scene theme inheritance. Picker + Grid tiles now wrap cloned sections in a fresh `.reveal > .slides` scope so theme CSS applies — fixes "dots on left" / wrong text alignment / wrong fonts. Scene overlays (Blackout, BRB, etc.) inherit the deck theme bg + text color by default; override via `slides-ng-scene-inherit-theme-bg: false` per-deck or via the matching global setting.
- **0.11.12** — Grid + picker thumbnails read the actual theme body background instead of hardcoding black (fixes white-themed decks showing as black tiles); Grid title-overlay duplication removed (had been wrong since v0.11.1 was applied only to picker); Grid slide-number badge upgraded to match picker design; speaker notes Save repaints the panel synchronously with the new content so it doesn't APPEAR to fail.
- **0.11.11** — removed the `slides-ng: true` frontmatter key (nothing read it; was documentation-only). Stripped from all example decks; removed the "Required" section from the Settings frontmatter-reference card. The "deck index / vault-wide deck list" feature that would have made it meaningful is now in the idea jar.
- **0.11.10** — collapsible frontmatter-reference card at the bottom of Settings → Slides NG. Lists every deck-level + per-slide key with a brief description and example. Closes the discoverability gap: previously the only docs were in PROJECT_BRIEF / CHANGELOG.
- **0.11.9** — per-deck frontmatter escape hatches. New `slides-ng-show-controls`, `slides-ng-show-menu`, `slides-ng-image-layout-split`, `slides-ng-line-step-dim`, `slides-ng-code-block-max-height`, `slides-ng-code-block-overflow-scroll`, `slides-ng-magic-move-duration`. Plus a power-user raw `slides-ng-reveal-config:` object that passes through to `Reveal.initialize()` for any reveal config the author wants (`autoSlide`, `loop`, `width`, `height`, etc.).
- **0.11.8** — removed the Menu toolbar button. After multiple rounds of fixes (v0.10.2 / v0.11.3) it remained unreliable across users — Grid covers slide navigation with real thumbnails, and the reveal-menu plugin is still loaded so its `M` keyboard shortcut still works inside the preview iframe.
- **0.11.7** — preview toolbar Prev/Next nav buttons + cursor-follow now respects auto-h1-breaks. slideIndexFromCursor was only counting `---` separators in the raw markdown, so cursor-follow stayed on slide 0 for auto-split decks. Now accepts an `autoH1Breaks` option (with frontmatter override) and bumps the slide index on each `#` after the first.
- **0.11.6** — DnD drop indicator gap-midpoint fix. Previously drew at the hovered panel's top OR bottom edge, which with the 6 px panel gap gave two different positions (looked like the line "jumped" between panel-A-bottom and panel-B-top as the cursor crossed the boundary). Now positions at the midpoint of the gap → consistent visual line regardless of which panel the cursor is over.
- **0.11.5** — auto-split slides on `#` headings. New setting + frontmatter flag (`slides-ng-auto-h1-breaks: true`) makes every top-level `#` start a new slide so authors can write decks as plain markdown outlines without remembering `---` separators. Pure-function `injectH1SlideBreaks` preserves existing separators, skips fenced code, ignores `##`/`###`. 16 unit tests + settings UI.
- **0.11.4** — DnD drop-indicator misalignment when the speaker view is scrolled. The indicator's absolute `top` was using viewport-relative deltas without adding `contentEl.scrollTop`, so a scrolled container showed the line above the cursor. Adding the scroll offset fixes it.
- **0.11.3** — Grid overlay tile size bumped 220→320 px so thumbnail text is legible (matches picker thumbnail density). Menu toolbar button: try DOM `.slide-menu-button.click()` FIRST (v0.7.0 strategy that was working), fall back to `Reveal.getPlugin('menu')` API; v0.10.2 had reversed this and `.toggle()` was silently no-op'ing for some users. Diagnostic console.log helps when it still doesn't work.
- **0.11.2** — picker current-tile highlight fix (E2E-caught regression). enablePickerStrip carries currentIdx for initial highlight; setPickerCurrent posts burst (5x) on every state change; applyCurrentTileStyle/clearCurrentTileStyle helpers ensure the .current visual treatment is consistent across buildPickerStrip / applyPickerStripLayout / setPickerCurrent paths.
- **0.11.1** — picker polish: title overlay removed (tile content already shows the slide heading), slide-number badge redesigned as a bordered square in the top-left, current slide tints the badge to accent + adds a halo, vertical auto-fit tile width capped at 240 px for PowerPoint-like density.
- **0.11.0** — PowerPoint-style thumbnail picker. Real slide miniatures replace the text-row list (text mode still available as a setting). Vertical or horizontal orientation, inline toggle button in the picker header, responsive tile sizing with optional manual pixel-width override, drag-resize picker panel height. Implemented via a new iframe in the picker panel + bridge commands `enablePickerStrip` / `setPickerOrientation` / `setPickerCurrent` that reuse the existing Grid-overlay DOM-clone-and-scale code.
- **0.10.8** — ROOT-CAUSE fix for the ribbon-black-pane saga. The real bug was that refresh() fires 3–4 times in quick succession on a single ribbon click (onOpen → setState chain), each reassigning srcdoc, browser mid-cancelling each load. Replaced direct-srcdoc-set with a `pendingHtml` queue drained by the ResizeObserver when the iframe is real-sized. Reveal initialises exactly once per refresh.
- **0.10.7** — patch: dropped the 3s wait-for-size that made opens feel laggy (the v0.10.6 re-render-on-resize path covers the 0×0 case without blocking); explicit `setActiveLeaf({focus:true})` after revealLeaf so the preview pane actually gets focused on open.
- **0.10.6** — patch: intermittent black-pane fix. `waitForIframeSize` timeout 1.5s → 3s; when it times out at 0×0, view marks itself `renderedAtZeroSize` and the parent-side ResizeObserver re-triggers `refresh()` on the first non-zero resize so Reveal initialises fresh into the real viewport.
- **0.10.5** — defer srcdoc until iframe has non-zero dimensions (waitForIframeSize helper).
- **0.10.4** — patch: parent-side ResizeObserver on the iframe element posts `relayout` burst to the iframe bridge (now+60ms+180ms+400ms+900ms); iframe bridge handles `relayout` by calling `Reveal.layout()`+`sync()`; belt-and-suspenders `Reveal.layout()` inside the iframe's `Reveal.on('ready')` hook. Together these defeat the ribbon-open-blank-pane bug that v0.10.2's in-iframe observer couldn't catch in Electron.
- **0.10.3** — picker rebuilt as single scrollable column (compact/list toggle gone, "Show all N" footer gone); inline countdown-target input on the timer panel; `nextLine` ("Next: …" text) panel retired; mermaid blocks in two example decks replaced with ASCII (mermaid bundling added to idea jar).
- **0.10.2** — patch: iframe ResizeObserver-driven relayout guard fixes "black pane on initial open, wrong size after tab switch"; Menu toolbar button uses `Reveal.getPlugin('menu').toggle()` (was clicking the menu plugin's button programmatically and silently no-op'ing); Grid icon switched from `grid-3x3` to `layout-grid` (former wasn't bundled); visual-next-slide goto retries to defeat the bridge-not-yet-listening race; file-based debug logger added.
- **0.10.1** — patch: ribbon-button auto-render fix (Shiki cold-start blocked the first render; setState/active-leaf race left filePath null); title-centering fix (drag handle inserted into space-between header now wraps in a sub-div); drop-indicator no-op suppression; Grid tile dimensions read from Reveal config instead of hard-coded.
- **0.10.0** — speaker-view polish bundle: unified Timer panel with elapsed/countdown/lap modes (warning + overrun colours); 2-column auto-fit panel flow at ≥ 900 px container width; visual-next-slide width capped + centred; "Show all N slides" picker footer restyled as text-link; Grid moved from speaker view to preview toolbar; per-scene Lucide icon customisation via settings; drag-handle layout no longer accidentally centres adjacent panel content.
- **0.9.0** — export-for-PDF options modal: notes on/off, aspect ratio (current/16:9/4:3), theme override, max-pages-per-slide. Aspect/theme flow through RenderDefaults; notes/pages flow through reveal URL params. Modal opens for both the toolbar button and the `export-for-pdf` command.
- **0.8.4** — drag handles moved inline next to panel section titles (no longer floating on the left edge)
- **0.8.3** — DnD floating drop-line indicator at exact insert position; handle restyled
- **0.8.2** — editable speaker notes (click Edit → textarea → Save writes back to deck file; pure-function helpers in editSlideNotes.ts)
- **0.8.1** — drag-and-drop modular speaker panels (grip handles, vertical reorder, persists via speakerPanelOrder)
- **0.8.0** — per-panel show/hide, resizable visual-next-slide preview, clickable Slide N of M opens Grid, compact picker redesign with clickable rows + view-all footer
- **0.7.5** — speaker view opens as new tab instead of horizontal split; menu-plugin autoOpen disabled
- **0.7.4** — Grid tiles show real slide thumbnails via DOM clone + idle-time prewarm
- **0.7.3** — custom slides-picker overlay replaces reveal's stock overview for the Grid button
- **0.7.2** — scene overlay flex-direction column so multi-block content stacks vertically
- **0.7.1** — patch release: frontmatter keys namespaced `slides-ng-*` (back-compat for legacy keys), Grid CSS rework with aspect-ratio tiles + no horizontal scroll, scene newlines fixed, Menu toolbar button actually toggles, duplicate Blackout removed, "Use current" focus-steal fix
- **0.7.0** — speaker UX overhaul: visual next-slide preview iframe, OBS-style scene overlays, Grid button real-grid fix with slide numbers, icon-based speaker buttons, Menu toolbar button
- **0.6.0** — authoring polish bundle: per-slide backgrounds with vault-path resolution, code-block max-height + scroll, `customCSS:` frontmatter injection, `transitionSpeed` setting, `magicMoveDurationMs` setting
- **0.5.4** — ribbon-button focus-steal recovery
- **0.5.3** — toolbar wrap on narrow leaves
- **0.5.2** — in-window controls + reveal-menu plugin + Grid (overview) button + 6 new settings
- **0.5.1** — "Use current" toolbar button
- **0.5.0** — In-Obsidian Speaker Console + cursor-follow + toolbar polish

## Idea jar

Captured for later. Priority is rough intent, not commitment. Effort is a
ballpark.

### Speaker / presentation UX

| Idea | Priority | Effort |
|---|---|---|
| Reverse follow: preview → editor cursor (only on horizontal `slidechanged`, never on fragment events — that's where Slides-Extended jittered) | High | 1-2 hr |
| **Multi-next-slide preview** (NEW, v0.10.2 user request) — render the next N slides (e.g. 3) as a row of small thumbnails with corner numbers, instead of a single visual-next iframe. Lets the presenter see what's coming further out. | Medium | 3-4 hr — extend visualNext panel to N mini-iframes or a single iframe driven to multiple positions via screenshot/clone tricks |
| **Free-grid panel layout** (NEW, v0.10.2 user request) — beyond the current vertical-with-DnD-and-2-col-flow, let the user drop panels into ARBITRARY positions on a 2D grid (size + position both editable). Closer to OBS-style panel docking. | Medium-High | 8-12 hr — big departure from the current 1D list ordering; needs grid-position state per panel, a different drop-zone interaction model, and resize handles. Wait for current modular approach to be exhausted before committing. |
| Pre-rendered slide thumbnails in speaker picker | Medium | 3-4 hr — Grid overview (fixed in 0.7) covers most of this for free |
| Per-slide visual overlay tools — drawing layer, laser pointer, color swatches (Extended Slides parity) | Medium-High | Large — 0.9.0 candidate |
| Hyperlinked slide-web navigation via block IDs | Medium | User-flagged but acknowledged as over-engineering — defer until requested |
| Slide-web navigation graph view (visual editor for the slide-web) | Future research | Strong over-engineering; only if hyperlinked nav proves valuable |
| Custom scene shortcuts (keyboard bindings) | Low | Add once scenes ship and the user has favourites |
| Full panel-system speaker view (resizable + free positioning) | Future | 6-8 hr — only if 0.8.0's light DnD insufficient |
| Per-panel save/load layouts | Future | 1-2 hr |

### Rendering / fidelity

| Idea | Priority | Effort |
|---|---|---|
| pretext (`chenglou/pretext`) overflow detection at render time — warn or auto-fit slides whose content will clip the bounding box | Low | 2-3 hr (lib is heavy ~200 KB+) |
| pretext-driven auto-fit for `cover` / `statement` / `quote` layouts (currently fixed font sizes) | Low | 2-3 hr (same lib) |
| Fragment animation timing setting | Low | <1 hr |
| Per-slide `customCSS:` (scoped via generated `[data-slide-uid]` selectors) | Medium | 2 hr — needs slide-uid assignment in parseDeck |
| Code-fence line numbers (Shiki transformer) | Low | 1 hr |
| More Shiki languages on-demand | Deferred | Static-bundle pattern locks at build time; dynamic loading breaks the sync `highlight()` contract — significant refactor for marginal value |
| **Mermaid diagram support** (NEW, v0.10.3 user-noticed) — render ` ```mermaid ` fences as actual diagrams. Big — mermaid is ~700 KB minified. Would blow past our 2 MB soft cap unless lazy-loaded (and lazy-loading breaks the iframe-srcdoc no-network promise). Practical option: render mermaid OUTSIDE the iframe, inject SVG, and bundle a smaller subset of diagram types. | Medium-High | 6-8 hr — non-trivial because of bundle-size constraint |

### Authoring / workflow

| Idea | Priority | Effort |
|---|---|---|
| Auto-detect deck files via folder convention (e.g. `Decks/*.md` → auto-show Speaker icon in editor) | Low | 1 hr |
| **Deck index / "all decks in vault" view** — a sidebar list or command palette enumeration of every `.md` file with `slides-ng: true` (or some other opt-in marker) in frontmatter. Lets users browse decks without remembering paths. Reserved key was previously documented as required; removed in v0.11.11 since nothing reads it yet. Implement this feature and the key becomes meaningful again. | Medium | 2-3 hr |
| Export to PPTX | Future | Large (likely a separate tool) |

### Research / experiments

| Idea | Priority | Effort |
|---|---|---|
| WebContainers / StackBlitz experiment for true Slidev parity — would let us run the full Slidev runtime in-browser. See [`cybersader/markup-slides-context-and-workflow`](https://github.com/cybersader/markup-slides-context-and-workflow). Hugely heavy; only worth pursuing if a major Slidev feature can't be implemented standalone | Future research | Large |

## What's deliberately NOT on the roadmap

These were considered and ruled out — flagged here so they don't keep reappearing:

- **Localhost-port-based browser preview** — violates the brief's §3 hard constraints. Slides Extended uses one; we don't.
- **Spawned dev-server (`npm run dev` style)** — same. Plugin is a single `main.js`.
- **CDN-loaded assets at runtime** — everything's bundled.
- **`view: scroll` mode** — reveal.js auto-activates this in small viewports and it rearranges section DOM + breaks discrete navigation. Locked to `view: "presentation"`.
- **`allow-same-origin` on the iframe sandbox** — keeps the security boundary tight; all cross-frame communication is postMessage-based.

## Constraints any new feature must respect

From `PROJECT_BRIEF.md` §3 (enforced by `tests/hardConstraints.test.ts`):

1. No localhost listening ports
2. No `child_process.spawn` / `exec`
3. No `eval` / `Function()` of user content
4. No external CDN at render time
5. Single-file `main.js` output (≤ 2 MB soft cap)
6. UX-visible features ship with WebdriverIO + screenshot coverage
