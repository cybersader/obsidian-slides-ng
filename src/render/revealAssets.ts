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
  themeBlack,
  themeWhite,
  themeSimple,
} from "./revealAssets.generated";

export { revealJs, revealCss };

const themesByName: Record<string, string> = {
  black: themeBlack,
  white: themeWhite,
  simple: themeSimple,
};

/** Look up a theme by name. Falls back to `black` if unknown. */
export function getTheme(name: string | undefined): string {
  return themesByName[name ?? "black"] ?? themesByName.black;
}
