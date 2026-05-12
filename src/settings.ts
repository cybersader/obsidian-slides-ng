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
}

export const REVEAL_TRANSITIONS = [
  "none",
  "fade",
  "slide",
  "convex",
  "concave",
  "zoom",
] as const;

export const DEFAULT_SETTINGS: SlidesNGSettings = {
  defaultTheme: "black",
  defaultTransition: "slide",
  followCursorInEditor: true,
};
