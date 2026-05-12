/**
 * Re-export of the build-time-generated reveal.js asset strings.
 *
 * The generated module is gitignored — re-run `bun run gen:reveal-assets`
 * (also runs automatically as part of `dev` and `build`) to refresh it
 * from node_modules.
 */
import {
  revealJs,
  revealCss,
  THEMES_BY_NAME,
  magicMoveJs,
  magicMoveCss,
  revealMenuJs,
  revealMenuCss,
} from "./revealAssets.generated";

export {
  revealJs,
  revealCss,
  magicMoveJs,
  magicMoveCss,
  revealMenuJs,
  revealMenuCss,
};

/** All theme names we ship. Always includes "black" as the default. */
export function availableThemes(): string[] {
  return Object.keys(THEMES_BY_NAME).sort();
}

/** Look up a theme by name. Falls back to `black` if unknown. */
export function getTheme(name: string | undefined): string {
  if (name && Object.prototype.hasOwnProperty.call(THEMES_BY_NAME, name)) {
    return THEMES_BY_NAME[name];
  }
  return THEMES_BY_NAME.black;
}
