/**
 * Slidev line-step info-string parser.
 *
 * Slidev's code-fence info string supports two bracket flavours:
 *
 *   ```ts [1|2-3|all]      → square-bracket form (the canonical one in docs)
 *   ```ts {1|2-3|all}      → curly-bracket form (used by `monaco-diff` etc.)
 *   ```ts {*|2-3|all}      → '*' is an alias for 'all'
 *
 * Each `|`-separated token is one *step*. A step is a Set of 1-based
 * line numbers to highlight; everything else gets dimmed. Special tokens:
 *
 *   - `all` or `*`         → every line is highlighted (no dimming)
 *   - `N`                  → just line N
 *   - `N-M` (M ≥ N)        → lines N through M, inclusive
 *
 * `parseLineStep` returns:
 *
 *   - `{ steps: Step[], lang: string }` for a recognised info-string with steps
 *   - `null` if the info-string has no step syntax (caller falls back to plain Shiki)
 *
 * Malformed brackets (missing close, bad tokens) → return null and let the
 * caller treat the whole thing as a normal lang spec.
 */

export interface Step {
  /** Lines included in this step. `null` means "all lines, no dimming". */
  lines: Set<number> | null;
  /** Original token text for debugging / data-attrs (e.g. "2-3"). */
  raw: string;
}

export interface ParsedLineStep {
  lang: string;
  steps: Step[];
}

const BRACKET_RE = /^([^\s[{]+)\s*([[{])([^\]}]+)([\]}])\s*$/;

export function parseLineStep(infoString: string): ParsedLineStep | null {
  const trimmed = infoString.trim();
  const m = BRACKET_RE.exec(trimmed);
  if (!m) return null;

  const [, lang, openBracket, body, closeBracket] = m;
  // Brackets must match: [ with ], { with }.
  if (openBracket === "[" && closeBracket !== "]") return null;
  if (openBracket === "{" && closeBracket !== "}") return null;

  const tokens = body.split("|").map((t) => t.trim()).filter((t) => t.length > 0);
  if (tokens.length === 0) return null;

  const steps: Step[] = [];
  for (const token of tokens) {
    const step = parseStepToken(token);
    if (!step) return null;
    steps.push(step);
  }

  return { lang, steps };
}

function parseStepToken(token: string): Step | null {
  if (token === "all" || token === "*") {
    return { lines: null, raw: token };
  }
  // Single number
  if (/^\d+$/.test(token)) {
    const n = Number(token);
    if (n < 1) return null;
    return { lines: new Set([n]), raw: token };
  }
  // Range N-M (or N,M which Slidev also accepts in some contexts; we support `-` only for now)
  const rangeMatch = /^(\d+)-(\d+)$/.exec(token);
  if (rangeMatch) {
    const lo = Number(rangeMatch[1]);
    const hi = Number(rangeMatch[2]);
    if (lo < 1 || hi < lo) return null;
    const lines = new Set<number>();
    for (let i = lo; i <= hi; i++) lines.add(i);
    return { lines, raw: token };
  }
  // Comma-separated lines (e.g. "1,3,5"). Slidev's docs don't formalise this
  // but real-world decks use it.
  if (/^\d+(,\d+)*$/.test(token)) {
    const lines = new Set<number>();
    for (const part of token.split(",")) {
      const n = Number(part);
      if (n < 1) return null;
      lines.add(n);
    }
    return { lines, raw: token };
  }
  // Special tokens like `monaco-diff` etc — not line-step, so we treat the
  // whole bracket as unparseable for stepping purposes (return null at top level).
  return null;
}
