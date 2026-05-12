/**
 * Magic-Move key parser.
 *
 * Slidev-flavoured convention for pairing code blocks across consecutive
 * slides for smooth token-morphing transitions:
 *
 *   ```ts {key=mybox}
 *   const x = 1
 *   ```
 *
 *   ---
 *
 *   ```ts {key=mybox}
 *   const x = 1
 *   const y = 2
 *   ```
 *
 * Same `key=` value on two consecutive code fences → paired for
 * shiki-magic-move animation when the user advances slides.
 *
 * Returns `{ lang, key }` if the info-string contains a `key=NAME`
 * directive in either bracket form (`{key=foo}` or `[key=foo]`), or
 * null if no magic-move key is present.
 */

export interface ParsedMagicMoveKey {
  lang: string;
  key: string;
}

const BRACKET_BODY = /^([^\s[{]+)\s*[\[{]([^\]}]+)[\]}]\s*$/;
const KEY_RE = /\bkey\s*=\s*([a-zA-Z][\w-]*)/;

export function parseMagicMoveKey(infoString: string): ParsedMagicMoveKey | null {
  const trimmed = infoString.trim();
  const m = BRACKET_BODY.exec(trimmed);
  if (!m) return null;
  const [, lang, body] = m;
  const keyMatch = KEY_RE.exec(body);
  if (!keyMatch) return null;
  return { lang, key: keyMatch[1] };
}
