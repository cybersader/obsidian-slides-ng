/**
 * Fine-grained Shiki bundle. Loads only the grammars and the theme we
 * actually use, via `shiki/core` + the pure-JS regex engine (no WASM
 * payload). Massively smaller than the default `createHighlighter` from
 * the `shiki` entry point, which eagerly bundles ~6000 grammars.
 *
 * Adding a new language: import the .mjs grammar from `shiki/langs/`,
 * include it in DEFAULT_LANGS below, and Shiki will pick up any aliases
 * the grammar defines (so `ts` resolves to typescript automatically).
 */

import type { HighlighterCore, ShikiTransformer } from "shiki/core";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

import githubDark from "shiki/themes/github-dark.mjs";

import typescript from "shiki/langs/typescript.mjs";
import javascript from "shiki/langs/javascript.mjs";
import python from "shiki/langs/python.mjs";
import bash from "shiki/langs/bash.mjs";
import html from "shiki/langs/html.mjs";
import css from "shiki/langs/css.mjs";
import markdown from "shiki/langs/markdown.mjs";
import json from "shiki/langs/json.mjs";
import yaml from "shiki/langs/yaml.mjs";
import go from "shiki/langs/go.mjs";
import rust from "shiki/langs/rust.mjs";

export const DEFAULT_THEME = "github-dark";

const DEFAULT_LANGS = [
  typescript,
  javascript,
  python,
  bash,
  html,
  css,
  markdown,
  json,
  yaml,
  go,
  rust,
];

let cached: HighlighterCore | null = null;
let pending: Promise<HighlighterCore> | null = null;

/** Initialise (or return) the shared Shiki highlighter. */
export async function warmHighlighter(): Promise<HighlighterCore> {
  if (cached) return cached;
  if (pending) return pending;
  pending = createHighlighterCore({
    themes: [githubDark],
    langs: DEFAULT_LANGS,
    engine: createJavaScriptRegexEngine(),
  }).then((h) => {
    cached = h;
    pending = null;
    return h;
  });
  return pending;
}

/**
 * Synchronously highlight a code block. If the highlighter isn't warm
 * yet, returns a plain escaped `<pre><code>` so rendering doesn't block.
 *
 * Lang resolution: Shiki recognises common aliases (ts↔typescript,
 * js↔javascript, py↔python, sh↔bash, etc.) for any grammar it has
 * loaded. We pass `lang` through unchanged and let Shiki resolve it;
 * on failure (unknown grammar) we fall back to plaintext.
 */
export function highlight(code: string, lang?: string): string {
  if (!cached) {
    return `<pre><code class="language-${lang ?? "text"}">${escapeHtml(code)}</code></pre>`;
  }
  const requested = lang && lang.length > 0 ? lang : "text";
  try {
    return cached.codeToHtml(code, {
      lang: requested,
      theme: DEFAULT_THEME,
    });
  } catch {
    try {
      return cached.codeToHtml(code, { lang: "text", theme: DEFAULT_THEME });
    } catch {
      return `<pre><code class="language-text">${escapeHtml(code)}</code></pre>`;
    }
  }
}

/** True iff the highlighter has finished warming. Useful for tests. */
export function isWarm(): boolean {
  return cached !== null;
}

/**
 * Highlight with one or more Shiki transformers attached. Used by the
 * line-step renderer to dim lines outside the current step's range.
 * Falls back to plain `highlight()` if the highlighter isn't warm yet
 * or if Shiki throws (unknown lang etc.).
 */
export function highlightWithTransformers(
  code: string,
  lang: string | undefined,
  transformers: ShikiTransformer[]
): string {
  if (!cached) return highlight(code, lang);
  const requested = lang && lang.length > 0 ? lang : "text";
  try {
    return cached.codeToHtml(code, {
      lang: requested,
      theme: DEFAULT_THEME,
      transformers,
    });
  } catch {
    return highlight(code, lang);
  }
}

/** Test-only: reset the cached highlighter. Don't call this in production code. */
export function _resetForTest(): void {
  cached = null;
  pending = null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
