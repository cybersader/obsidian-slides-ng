/**
 * Obsidian callouts marked extension.
 *
 * Transforms Obsidian's native callout syntax
 *
 *   > [!warning] Optional title
 *   > body markdown, can span
 *   > multiple lines
 *
 * into Obsidian-compatible callout HTML:
 *
 *   <div class="callout" data-callout="warning">
 *     <div class="callout-title">
 *       <span class="callout-icon"></span>
 *       <span class="callout-title-inner">Optional title</span>
 *     </div>
 *     <div class="callout-content"> …rendered body… </div>
 *   </div>
 *
 * DESIGN (see the callout CSS in revealTemplate.ts):
 *  - The DOM mirrors Obsidian's own structure + class names, so any
 *    Obsidian callout-CSS knowledge transfers and a future "map to a
 *    callout plugin" setting is natural.
 *  - ALL colour/icon styling lives in CSS keyed on `[data-callout="type"]`
 *    via `--callout-color` / `--callout-icon` variables — this extension
 *    only emits the literal type, so decks/themes can override any level
 *    (one type, all callouts, or a custom type) with plain CSS. Unknown
 *    types still emit `data-callout="whatever"` and fall back gracefully.
 *  - Only blockquotes whose FIRST line is `[!type]` are transformed;
 *    ordinary `>` quotes pass straight through to marked's blockquote.
 *  - Pure + iframe-safe + offline (no Obsidian API, no network) so the
 *    standalone HTML export renders callouts identically.
 *
 * Folds (`> [!info]-` / `> [!info]+`) render EXPANDED; the marker is kept
 * on `data-callout-fold` for a possible future collapsible mode.
 *
 * Nesting works: one `>` level is stripped and the body is re-lexed
 * through the same instance, so `> > [!info]` nests recursively.
 */

import type { MarkedExtension, Tokens, TokensList, Token } from "marked";

/** First-line pattern: `> [!type]` + optional fold marker + optional title. */
const CALLOUT_FIRST_LINE =
  /^ {0,3}>[ \t]?\[!([A-Za-z0-9_-]+)\]([+-]?)[ \t]*(.*)$/;

/** A line that is part of the blockquote (starts with an optional-indent `>`). */
const BLOCKQUOTE_LINE = /^ {0,3}>/;

interface CalloutToken extends Tokens.Generic {
  type: "obsidianCallout";
  raw: string;
  calloutType: string;
  fold: "" | "+" | "-";
  titleTokens: Token[];
  tokens: TokensList;
}

/** Strip a single leading blockquote marker (`>` + optional one space). */
function stripQuoteMarker(line: string): string {
  const m = /^ {0,3}> ?(.*)$/.exec(line);
  return m ? m[1] : line;
}

/** Default title when none is given: the type with its first letter cased. */
function defaultTitle(type: string): string {
  if (!type) return "";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Escape a value for an HTML attribute (also escapes `<`/`>` so a crafted
 * type can't break out of the attribute). Mirrors pandocFencedDivs.
 */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface LexerCtx {
  lexer: {
    blockTokens: (s: string, t: TokensList) => TokensList;
    inlineTokens: (s: string) => Token[];
  };
}
interface ParserCtx {
  parser: {
    parse: (t: TokensList) => string;
    parseInline: (t: Token[]) => string;
  };
}

export const obsidianCallouts: MarkedExtension = {
  extensions: [
    {
      name: "obsidianCallout",
      level: "block",
      start(src: string): number | undefined {
        // Cheap pre-scan: a line beginning `> [!`.
        const m = src.match(/(^|\n) {0,3}>[ \t]?\[!/);
        if (!m || m.index === undefined) return undefined;
        return m[0].startsWith("\n") ? m.index + 1 : m.index;
      },
      tokenizer(this: LexerCtx, src: string): CalloutToken | undefined {
        const lines = src.split("\n");
        const first = CALLOUT_FIRST_LINE.exec(lines[0]);
        if (!first) return undefined; // not a callout → let blockquote handle it

        // Consume contiguous blockquote lines (each starts with `>`). A
        // line without `>` ends the callout (Obsidian requires the marker).
        let i = 1;
        while (i < lines.length && BLOCKQUOTE_LINE.test(lines[i])) i++;

        // Exact consumed source (cap at src length when there's no trailing
        // newline at EOF), so marked advances by the right amount.
        let end = 0;
        for (let j = 0; j < i; j++) end += lines[j].length + 1;
        end = Math.min(end, src.length);

        const calloutType = first[1].toLowerCase();
        const fold = (first[2] || "") as "" | "+" | "-";
        const titleText = (first[3] || "").trim();
        const bodyText = lines
          .slice(1, i)
          .map(stripQuoteMarker)
          .join("\n");

        const titleTokens = this.lexer.inlineTokens(
          titleText || defaultTitle(calloutType)
        );
        const tokens = bodyText.trim()
          ? this.lexer.blockTokens(bodyText, [] as unknown as TokensList)
          : ([] as unknown as TokensList);

        return {
          type: "obsidianCallout",
          raw: src.slice(0, end),
          calloutType,
          fold,
          titleTokens,
          tokens,
        };
      },
      renderer(this: ParserCtx, token: Tokens.Generic): string {
        const t = token as CalloutToken;
        const titleHtml = this.parser.parseInline(t.titleTokens);
        const bodyHtml = t.tokens.length ? this.parser.parse(t.tokens) : "";
        const foldAttr = t.fold
          ? ` data-callout-fold="${escapeAttr(t.fold)}"`
          : "";
        return (
          `<div class="callout" data-callout="${escapeAttr(t.calloutType)}"${foldAttr}>` +
          `<div class="callout-title">` +
          `<span class="callout-icon" aria-hidden="true"></span>` +
          `<span class="callout-title-inner">${titleHtml}</span>` +
          `</div>` +
          (bodyHtml ? `<div class="callout-content">\n${bodyHtml}</div>` : "") +
          `</div>\n`
        );
      },
    },
  ],
};
