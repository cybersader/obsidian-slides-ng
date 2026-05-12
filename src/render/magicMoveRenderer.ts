/**
 * Magic-Move server-side renderer.
 *
 * Given a code block tagged with `{key=NAME}`, emit a marker `<div>`
 * containing:
 *   - the regular Shiki-rendered HTML (so the slide looks right before
 *     any JS runs)
 *   - data attributes carrying the JSON-serialized keyed token info
 *
 * A tiny `<script>` injected in the iframe srcdoc (see
 * `revealTemplate.ts` magic-move bootstrap) reads those data attrs at
 * load time, groups markers across slides by key, and wires
 * shiki-magic-move's `MagicMoveRenderer` to animate between paired
 * states when reveal.js advances.
 */

import { highlight, getKeyedTokensSync } from "./shiki";

export interface ParsedMagicMoveKey {
  lang: string;
  key: string;
}

/**
 * Render a code block as a magic-move marker. If the highlighter isn't
 * warm or token computation fails, falls back to plain Shiki
 * highlighting (the deck still renders, just without the animation).
 */
export function renderMagicMoveBlock(
  code: string,
  parsed: ParsedMagicMoveKey,
  theme?: string
): string {
  const { lang, key } = parsed;
  const initialHtml = highlight(code, lang, theme);
  const tokens = getKeyedTokensSync(code, lang, theme);
  if (!tokens) {
    // Couldn't get keyed tokens; render as a normal code block. No
    // marker so the iframe-side bootstrap doesn't pick it up.
    return initialHtml;
  }
  const tokensJson = escapeAttrValue(JSON.stringify(tokens));
  return (
    `<div class="slides-ng-magic-move" data-mm-key="${escapeAttrValue(key)}" ` +
    `data-mm-lang="${escapeAttrValue(lang)}" data-mm-tokens="${tokensJson}">` +
    initialHtml +
    `</div>`
  );
}

function escapeAttrValue(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
