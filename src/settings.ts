/**
 * Plugin settings — persisted via Plugin.loadData/saveData. Per-deck
 * frontmatter values (theme, transition) override these.
 */
export interface SlidesNGSettings {
  /** Default reveal.js theme name (must be one of the bundled themes). */
  defaultTheme: string;
  /** Default reveal.js transition name. */
  defaultTransition: string;
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
};
