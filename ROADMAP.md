# slides-ng — roadmap + idea jar

What's coming, in rough order of intent. This is a working document — items
move between sections as work happens. Released versions live in
[CHANGELOG.md](./CHANGELOG.md).

## In flight

### 0.5.2 — bug fixes + in-window controls + settings expansion

- Slide-number-click → black overlay bug (suppress the slide-number `<a>` click that falls into reveal's pause handler)
- Speaker view Start/Pause visual state — button label flips, accent color when running, predictable 1Hz tick
- In-window reveal.js controls toggle — show reveal's arrows + progress bar inside the embedded iframe when wanted
- Reveal.js menu plugin bundled — hamburger menu in the iframe corner with heading outline + slide list (Extended-Slides-parity nav)
- "Grid" button in the speaker view → reveal.js overview mode (free thumbnail nav)
- 6 new settings: `defaultLayout`, `codeTheme`, `imageLayoutSplit`, `speakerTimerTickMs`, `speakerPickerDefaultMode`, `lineStepDimOpacity`
- Settings tab grouped with section headings (Rendering / Editor / Speaker / Code / Layouts)

### 0.6.0 — visual speaker UX + modular panels

- **True visual next-slide preview** — second mini-iframe in the speaker view rendering the next slide at scale (theme, fonts, code highlighting, layouts intact)
- **Light drag-and-drop modular panels** — each speaker panel (status / controls / timer / next / notes / picker) gets a drag handle, vertical reorder, order persists per-user
- **Per-panel show/hide** — settings toggles to hide panels you don't use during presentation

## Idea jar

Captured for later. Priority is rough intent, not commitment. Effort is a
ballpark.

### Speaker / presentation UX

| Idea | Priority | Effort |
|---|---|---|
| Reverse follow: preview → editor cursor (only on horizontal `slidechanged`, never on fragment events — that's where Slides-Extended jittered) | Medium | 1-2 hr |
| Pre-rendered slide thumbnails in speaker picker (html2canvas or tiny per-slide iframe — reveal-overview "Grid" button covers 80% for free) | Medium | 3-4 hr |
| Per-slide visual overlay tools — drawing layer, laser pointer, color swatches (Extended Slides parity) | Medium | Large |
| Full panel-system speaker view (resizable + free positioning, beyond the 0.6.0 light DnD) — needs a grid lib | Future | 6-8 hr |
| Per-panel save/load layouts | Future | 1-2 hr |

### Rendering / fidelity

| Idea | Priority | Effort |
|---|---|---|
| Per-slide background image / video — reveal supports `data-background-image` natively; works today via `<!-- slide data-background-image="..." -->` but untested + undocumented | Medium | <1 hr (verify + doc) |
| pretext (`chenglou/pretext`) overflow detection at render time — warn or auto-fit slides whose content will clip the bounding box | Low | 2-3 hr (lib is heavy ~200 KB+) |
| pretext-driven auto-fit for `cover` / `statement` / `quote` layouts (currently fixed font sizes) | Low | 2-3 hr (same lib) |
| Magic-Move animation duration setting | Low | <1 hr |
| Reveal.js transition speed setting (`default` / `fast` / `slow`) | Low | <1 hr |
| Fragment animation timing setting | Low | <1 hr |
| Code block max-height with internal scroll (long blocks currently overflow slides) | Low | 1 hr |
| More Shiki languages on-demand (currently bundles 11) | Low | 1 hr |
| Slide-level CSS injection per deck — `<style>` block in frontmatter, scoped to that deck | Low | 1 hr |

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
