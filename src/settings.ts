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

  /**
   * Max-height for fenced code blocks before they scroll internally.
   * Any valid CSS length (e.g. `"60vh"`, `"400px"`). Use `"none"` to
   * remove the cap entirely.
   */
  codeBlockMaxHeight: string;

  /**
   * Whether code blocks scroll their overflow content. When false +
   * codeBlockMaxHeight is non-`none`, overflow is hidden — useful for
   * presentation modes where you'd rather the deck author shortened
   * the block.
   */
  codeBlockOverflowScroll: boolean;

  /**
   * Reveal.js animation pace. `default` is reveal's stock; `fast` is
   * 300 ms transitions; `slow` is 1200 ms.
   */
  transitionSpeed: "default" | "fast" | "slow";

  /**
   * Magic-Move animation duration in ms. shiki-magic-move's
   * MagicMoveRenderer accepts this as `duration`. Stock library
   * default is 500.
   */
  magicMoveDurationMs: number;

  /**
   * OBS-style placeholder/scene slides. Each is a markdown content
   * block the presenter can flash over the current slide during a
   * live presentation. Ships with 4 defaults; users add/edit via the
   * settings tab.
   */
  scenes: SceneDefinition[];

  /**
   * Per-panel visibility in the speaker view. Keys match the
   * `SpeakerPanelId` enum below; values are `true` (show) / `false`
   * (hide). Hidden panels are still mounted in the DOM but
   * `display:none`-d, so toggling at runtime is instant.
   */
  speakerPanelVisibility: Record<SpeakerPanelId, boolean>;

  /**
   * User-set vertical order of the speaker-view panels. Any panel ids
   * missing from the array fall back to their DEFAULT_SPEAKER_PANEL_ORDER
   * position so a settings file written by an older plugin version
   * remains valid. v0.8.1+.
   */
  speakerPanelOrder: SpeakerPanelId[];

  /**
   * User-set height of the visual-next-slide preview iframe (px).
   * `null` = use the default aspect-ratio sizing. Persisted via
   * settings rather than localStorage so the user's preference
   * follows the plugin across vault sync.
   */
  speakerVisualNextHeightPx: number | null;
}

/** All draggable/toggleable speaker-view panels. */
export type SpeakerPanelId =
  | "status"
  | "controls"
  | "timer"
  | "nextLine"
  | "visualNext"
  | "scenes"
  | "notes"
  | "picker";

export const SPEAKER_PANEL_LABELS: Record<SpeakerPanelId, string> = {
  status: "Status bar (slide N of M + timer)",
  controls: "Navigation controls (First / Prev / Next / Last / Grid)",
  timer: "Timer controls (Start, Reset)",
  nextLine: "Next-slide title line",
  visualNext: "Visual next-slide preview",
  scenes: "Scenes (overlay slides)",
  notes: "Speaker notes",
  picker: "Slide picker",
};

export const DEFAULT_SPEAKER_PANEL_VISIBILITY: Record<SpeakerPanelId, boolean> = {
  status: true,
  controls: true,
  timer: true,
  nextLine: true,
  visualNext: true,
  scenes: true,
  notes: true,
  picker: true,
};

/** Default vertical order of the speaker-view panels. */
export const DEFAULT_SPEAKER_PANEL_ORDER: SpeakerPanelId[] = [
  "status",
  "controls",
  "timer",
  "nextLine",
  "visualNext",
  "scenes",
  "notes",
  "picker",
];

export interface SceneDefinition {
  /** Stable identifier — used in postMessage payloads + active-scene tracking. */
  id: string;
  /** Button label shown in the speaker view. */
  label: string;
  /**
   * Markdown content rendered into the overlay. Empty string = an
   * all-black blackout (no content rendered, just the dark overlay).
   */
  content: string;
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
export const TRANSITION_SPEEDS = ["default", "fast", "slow"] as const;

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

export const DEFAULT_SCENES: SceneDefinition[] = [
  {
    id: "blackout",
    label: "Blackout",
    content: "",
  },
  {
    id: "brb",
    label: "Be right back",
    content: "# Be right back\n\nBack in a few minutes.",
  },
  {
    id: "qa",
    label: "Q & A",
    content: "# Q & A\n\nQuestions?",
  },
  {
    id: "standby",
    label: "Stand by",
    content: "# Stand by",
  },
];

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
  codeBlockMaxHeight: "60vh",
  codeBlockOverflowScroll: true,
  transitionSpeed: "default",
  magicMoveDurationMs: 500,
  scenes: DEFAULT_SCENES.map((s) => ({ ...s })),
  speakerPanelVisibility: { ...DEFAULT_SPEAKER_PANEL_VISIBILITY },
  speakerPanelOrder: [...DEFAULT_SPEAKER_PANEL_ORDER],
  speakerVisualNextHeightPx: null,
};
