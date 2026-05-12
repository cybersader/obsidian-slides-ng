/**
 * Plugin settings — persisted via Plugin.loadData/saveData. Per-deck
 * frontmatter values (theme, transition) override these.
 */
export interface SlidesNGSettings {
  /** Default reveal.js theme name (must be one of the bundled themes). */
  defaultTheme: string;
  /** Default reveal.js transition name. */
  defaultTransition: string;
  /**
   * When the user moves the cursor inside a deck file in the markdown
   * editor, the preview iframe jumps to the slide containing that cursor.
   * Default on; users who find it distracting can toggle off.
   */
  followCursorInEditor: boolean;

  /**
   * Layout used for slides that don't specify `layout:` in their
   * frontmatter. Default `"default"` (single column). Must be one of the
   * known layouts.
   */
  defaultLayout: string;

  /**
   * Shiki syntax-highlight theme for fenced code blocks. Bundled options
   * are listed in `BUNDLED_CODE_THEMES`. Default `"github-dark"`.
   */
  codeTheme: string;

  /**
   * Column split ratio for `image-left` / `image-right` layouts. Default
   * `"50/50"`; `"60/40"` shifts more space to the text column.
   */
  imageLayoutSplit: "50/50" | "60/40" | "40/60";

  /**
   * Speaker view timer refresh cadence in ms. Default 1000 (1Hz) so the
   * seconds counter advances predictably without wasting work.
   */
  speakerTimerTickMs: number;

  /**
   * Initial mode for the speaker view's slide picker. Persists across
   * sessions. `"compact"` shows current + next 3; `"list"` shows all
   * slides as a full list.
   */
  speakerPickerDefaultMode: "compact" | "list";

  /**
   * Opacity (0–1) applied to non-active lines during code line-stepping
   * (the Slidev `[1|2-3|all]` syntax). Default `0.32`.
   */
  lineStepDimOpacity: number;

  /**
   * Show reveal.js's built-in controls (arrows + progress bar) inside
   * the in-Obsidian iframe preview. Default off — keeps the embedded
   * preview clean. The standalone "Open in browser" export always shows
   * controls regardless of this setting.
   */
  showRevealControlsEmbedded: boolean;

  /**
   * Show the reveal.js-menu plugin's hamburger menu (heading outline +
   * slide list + theme switcher) inside the in-Obsidian iframe preview.
   * Default on once shipped — discoverable nav was a gap vs Slides
   * Extended.
   */
  showRevealMenuEmbedded: boolean;
}

export const REVEAL_TRANSITIONS = [
  "none",
  "fade",
  "slide",
  "convex",
  "concave",
  "zoom",
] as const;

export const IMAGE_LAYOUT_SPLITS = ["50/50", "60/40", "40/60"] as const;
export const PICKER_MODES = ["compact", "list"] as const;

/**
 * Shiki themes bundled into main.js. Adding a theme = importing it in
 * `src/render/shiki.ts` + adding the name here. Stay frugal — each theme
 * adds ~25 KB to the bundle.
 */
export const BUNDLED_CODE_THEMES = [
  "github-dark",
  "github-light",
  "dracula",
  "nord",
] as const;

export const DEFAULT_SETTINGS: SlidesNGSettings = {
  defaultTheme: "black",
  defaultTransition: "slide",
  followCursorInEditor: true,
  defaultLayout: "default",
  codeTheme: "github-dark",
  imageLayoutSplit: "50/50",
  speakerTimerTickMs: 1000,
  speakerPickerDefaultMode: "compact",
  lineStepDimOpacity: 0.32,
  showRevealControlsEmbedded: false,
  showRevealMenuEmbedded: true,
};
