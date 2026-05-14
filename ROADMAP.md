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

### Authoring / workflow

| Idea | Priority | Effort |
|---|---|---|
| Auto-detect deck files via folder convention (e.g. `Decks/*.md` → auto-show Speaker icon in editor) | Low | 1 hr |
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
