/**
 * Slidev-flavoured click-reveal transforms applied to pre-rendered slide
 * HTML. Translates `<v-click>` and `<v-clicks>` tags into reveal.js
 * `.fragment` classes.
 *
 *   <v-click>X</v-click>                  → <span class="fragment">X</span>
 *
 *   <v-clicks>
 *     - A             ── marked ──>       → each li gets class="fragment"
 *     - B
 *   </v-clicks>
 *
 * Limitation: regex-based, not a real HTML parser. Nested `<v-click>`
 * inside `<v-clicks>` is not handled specially. Slidev's `at="N"`
 * attribute is ignored for now (M5 will add click-index support).
 */

const V_CLICK_RE = /<v-click(?:\s+[^>]*)?>([\s\S]*?)<\/v-click>/g;
const V_CLICKS_RE = /<v-clicks(?:\s+[^>]*)?>([\s\S]*?)<\/v-clicks>/g;

// Block-level elements inside <v-clicks> get the `.fragment` class. We
// stop at the immediate children — Slidev's semantic is "each item
// reveals on the next click".
const CLICKS_CHILD_RE = /<(li|p|h[1-6]|blockquote|pre|figure)(\s[^>]*)?>/g;

export function applyClickReveals(html: string): string {
  let out = html.replace(V_CLICK_RE, '<span class="fragment">$1</span>');

  out = out.replace(V_CLICKS_RE, (_match, inner: string) => {
    return inner.replace(CLICKS_CHILD_RE, (tagMatch, tag: string, attrs?: string) => {
      const a = attrs ?? "";
      if (/\bclass\s*=\s*["'][^"']*["']/.test(a)) {
        return tagMatch.replace(
          /\bclass\s*=\s*["']([^"']*)["']/,
          'class="$1 fragment"'
        );
      }
      return `<${tag}${a} class="fragment">`;
    });
  });

  return out;
}
