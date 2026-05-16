/**
 * Pandoc fenced divs marked extension.
 *
 * Adds support for the Pandoc / Quarto / R-Markdown / MyST convention:
 *
 *   ::: classname
 *   markdown content
 *   :::
 *
 *   ::: { .class1 .class2 #my-id key="val" }
 *   nested markdown content here
 *   :::
 *
 * The inner content is parsed as normal markdown (paragraphs, headings,
 * lists, code blocks, etc) — that's the entire point of the convention:
 * a structural wrapper that lets the body keep being authored as
 * idiomatic markdown.
 *
 * Nesting: outer block uses N colons, inner block uses > N (3, 4, …):
 *
 *   :::: outer
 *   ::: inner
 *   body
 *   :::
 *   ::::
 *
 * Tokenizer accepts 3+ colons and matches the closing fence by length.
 *
 * Header forms (everything optional):
 *
 *   ::: classname                   — single class shorthand
 *   ::: classname-with-dashes       — same
 *   ::: { .a .b #id k="v" k2=val }  — full attribute syntax
 *   :::                             — bare div, no attrs
 *
 * This file is parser-only; rendering is via the renderer extension at
 * the bottom. The slide-layout snippets in templates.ts emit this
 * syntax — see SNIPPETS.md.
 */

import type { MarkedExtension, Tokens, TokensList } from "marked";

export interface FencedDivAttrs {
  classes: string[];
  id: string | null;
  attrs: Record<string, string>;
}

interface FencedDivToken extends Tokens.Generic {
  type: "pandocFencedDiv";
  raw: string;
  classes: string[];
  id: string | null;
  attrs: Record<string, string>;
  tokens: TokensList;
}

/**
 * Parse a fenced-div header (everything after the opening `:::`).
 * Examples:
 *   ""                          → { classes: [], id: null, attrs: {} }
 *   "hero"                      → { classes: ["hero"], id: null, attrs: {} }
 *   "my-callout"                → { classes: ["my-callout"], id: null, attrs: {} }
 *   "{ .a .b #id k=\"v\" }"     → { classes: ["a","b"], id: "id", attrs: { k: "v" } }
 */
export function parseFencedDivHeader(header: string): FencedDivAttrs {
  const trimmed = header.trim();
  if (!trimmed) return { classes: [], id: null, attrs: {} };

  // Bracketed form: { .class .class #id key=value key="quoted value" }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const inner = trimmed.slice(1, -1).trim();
    const classes: string[] = [];
    let id: string | null = null;
    const attrs: Record<string, string> = {};
    // Token-by-token scan respecting quoted values.
    const tokenRe = /(\S+?="[^"]*")|(\S+?='[^']*')|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(inner)) !== null) {
      const tok = m[0];
      if (tok.startsWith(".")) {
        classes.push(tok.slice(1));
      } else if (tok.startsWith("#")) {
        id = tok.slice(1);
      } else {
        const eq = tok.indexOf("=");
        if (eq > 0) {
          const k = tok.slice(0, eq);
          let v = tok.slice(eq + 1);
          if (
            (v.startsWith('"') && v.endsWith('"')) ||
            (v.startsWith("'") && v.endsWith("'"))
          ) {
            v = v.slice(1, -1);
          }
          attrs[k] = v;
        }
      }
    }
    return { classes, id, attrs };
  }

  // Shorthand: single class identifier (most common case).
  // Validate it looks like a CSS class name — no spaces, no special chars.
  if (/^[A-Za-z_][\w-]*$/.test(trimmed)) {
    return { classes: [trimmed], id: null, attrs: {} };
  }

  // Fallback: ignore unparseable header but still create the div.
  return { classes: [], id: null, attrs: {} };
}

/**
 * Escape a value for an HTML attribute. Also escapes `<` so a value
 * like `data-q="</div><script>..."` can\'t close out of the attr and
 * inject script tags after the div opening.
 */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render the attrs object into an HTML attribute string. Output order:
 * class, id, then alphabetised remaining attrs. Stable order makes
 * diffs / snapshot tests reliable.
 */
function renderAttrs(t: FencedDivAttrs): string {
  const parts: string[] = [];
  if (t.classes.length) {
    parts.push(`class="${escapeAttr(t.classes.join(" "))}"`);
  }
  if (t.id) {
    parts.push(`id="${escapeAttr(t.id)}"`);
  }
  const keys = Object.keys(t.attrs).sort();
  for (const k of keys) {
    parts.push(`${k}="${escapeAttr(t.attrs[k])}"`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

/**
 * Build the marked extension. Tokenizer matches `:::N ... :::N` blocks,
 * lexer recurses into the inner content, renderer emits a `<div>`.
 */
export const pandocFencedDivs: MarkedExtension = {
  extensions: [
    {
      name: "pandocFencedDiv",
      level: "block",
      start(src: string): number | undefined {
        // Cheap pre-check: any line starting with 3+ colons.
        const m = src.match(/(^|\n)(:{3,})/);
        if (!m || m.index === undefined) return undefined;
        return m[0].startsWith("\n") ? m.index + 1 : m.index;
      },
      tokenizer(this: { lexer: { blockTokens: (s: string, t: TokensList) => TokensList } }, src: string): FencedDivToken | undefined {
        // Match opening fence on its own line: `:::name`, `::: name`, or `:::`.
        const open = /^(:{3,})[ \t]*([^\n]*?)[ \t]*\n/.exec(src);
        if (!open) return undefined;
        const fence = open[1];
        const header = open[2];
        const bodyStart = open[0].length;

        // Find the matching closing fence — same OR more colons, on its
        // own line. Walk forward respecting nested fences (which use
        // strictly MORE colons than the outer).
        const closeRe = new RegExp(`\\n(:{${fence.length},})[ \\t]*\\n?`, "g");
        closeRe.lastIndex = bodyStart - 1;
        let depth = 1;
        let pos = bodyStart;
        let endMatch: RegExpExecArray | null = null;
        // Also track nested opens so we don\'t close prematurely.
        const nestedOpenRe = new RegExp(`\\n(:{${fence.length + 1},})[ \\t]*[^\\n]*\\n`, "g");
        nestedOpenRe.lastIndex = bodyStart - 1;

        // Simpler approach: scan line by line.
        const lines = src.slice(bodyStart).split("\n");
        let consumed = bodyStart;
        let bodyEnd = -1;
        let closeFenceLen = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Check for nested open: 3+ colons followed by non-empty (e.g. `:::name`)
          const openMatch = /^(:{3,})[ \t]*\S/.exec(line);
          // Check for close: 3+ colons followed by only whitespace
          const closeMatch = /^(:{3,})[ \t]*$/.exec(line);
          if (openMatch && openMatch[1].length >= fence.length) {
            depth++;
          } else if (closeMatch && closeMatch[1].length >= fence.length) {
            depth--;
            if (depth === 0) {
              bodyEnd = consumed;
              closeFenceLen = closeMatch[0].length + 1; // include trailing newline
              break;
            }
          }
          consumed += line.length + 1; // +1 for the \n
        }
        if (bodyEnd < 0) return undefined; // unbalanced — let marked treat as plain text
        const body = src.slice(bodyStart, bodyEnd);
        // Length of the whole matched block including the close fence.
        const rawLen = bodyEnd - 0 + closeFenceLen;
        const attrs = parseFencedDivHeader(header);
        const tokens = this.lexer.blockTokens(body, [] as unknown as TokensList);
        return {
          type: "pandocFencedDiv",
          raw: src.slice(0, rawLen),
          classes: attrs.classes,
          id: attrs.id,
          attrs: attrs.attrs,
          tokens,
        } as FencedDivToken;
      },
      renderer(this: { parser: { parse: (t: TokensList) => string } }, token: Tokens.Generic): string {
        const t = token as FencedDivToken;
        const attrStr = renderAttrs({ classes: t.classes, id: t.id, attrs: t.attrs });
        return `<div${attrStr}>\n${this.parser.parse(t.tokens)}</div>\n`;
      },
    },
  ],
};
