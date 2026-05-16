/**
 * v0.13.2: shared formatter for the entire snippet registry as a
 * single Markdown document. Used by:
 *
 *   1. The "Copy all snippets to clipboard" button in the settings
 *      tab — pastes a complete reference into LLM chats / agentic
 *      tooling in one click.
 *   2. scripts/generate-snippets-doc.mjs — writes SNIPPETS.md at the
 *      repo root + .claude/skills/slides-ng-snippets/SKILL.md so AI
 *      agents working in this repo have the same vocabulary the
 *      plugin ships with, never drifting from the runtime.
 *
 * Single source of truth: TEMPLATES in src/templates.ts.
 */

import { TEMPLATES, type SnippetTemplate } from "./templates";

/** Strip the cursor-marker `█` from a snippet body for documentation. */
function stripCursor(text: string): string {
  return text.replace(/█/g, "");
}

/** Format one snippet as a markdown section. */
function formatSnippet(tpl: SnippetTemplate): string {
  const parts: string[] = [];
  parts.push(`### \`::${tpl.name}\` — ${tpl.description}`);
  parts.push("");
  // HTML form (the default)
  parts.push("**HTML expansion (default):**");
  parts.push("");
  parts.push("```markdown");
  parts.push(stripCursor(tpl.expand().text).trimEnd());
  parts.push("```");
  // Shortcode form (when available)
  if (tpl.expandShortcode) {
    parts.push("");
    parts.push("**Shortcode expansion (experimental, opt-in):**");
    parts.push("");
    parts.push("```markdown");
    parts.push(stripCursor(tpl.expandShortcode().text).trimEnd());
    parts.push("```");
  }
  return parts.join("\n");
}

/**
 * Build the full markdown document containing every snippet.
 * Self-contained — paste into any LLM context and the assistant has
 * the entire vocabulary.
 */
export function formatAllSnippets(): string {
  const lines: string[] = [];
  lines.push("# slides-ng snippet reference");
  lines.push("");
  lines.push(
    "Snippets for the [obsidian-slides-ng](https://github.com/cybersader/obsidian-slides-ng) plugin. Type `::` at the start of a line in a deck file and pick a name from the autocomplete — the snippet replaces the typed text with the expansion below."
  );
  lines.push("");
  lines.push("## Authoring principle");
  lines.push("");
  lines.push(
    "Snippets emit raw HTML in the source file by default — the source IS the final form. No parse-time shortcode extension required downstream; any markdown tool with standard block-HTML support renders the slide correctly."
  );
  lines.push("");
  lines.push(
    "An experimental setting (`experimentalShortcodeSnippets`) switches insertions to the Pandoc fenced-div form (`::: name ... :::`) for users who prefer that style. Both forms render to the same `<div class=\"…\">` at runtime via the bundled marked extension."
  );
  lines.push("");
  lines.push("## CSS class catalog");
  lines.push("");
  lines.push(
    "All layout classes are pre-styled inside the deck iframe (`src/render/revealTemplate.ts`). Theme accents pull from reveal CSS vars (`--r-link-color`, `--r-main-color`, etc.) so swapping themes automatically reflows the snippet appearance."
  );
  lines.push("");
  lines.push("| Class | Purpose |");
  lines.push("|---|---|");
  lines.push("| `.hero` | Centered title block — large H1 + subtitle |");
  lines.push("| `.twocol` | Two equal columns (50/50) |");
  lines.push("| `.twocol-60` | Two columns at 60/40 split |");
  lines.push("| `.threecol` | Three equal columns |");
  lines.push("| `.image-left` / `.image-right` | Image + text side-by-side |");
  lines.push("| `.callout` | Side-bar block (accent color from theme) |");
  lines.push("| `.callout.warn` | Amber variant |");
  lines.push("| `.callout.danger` | Red variant |");
  lines.push("| `.callout.success` | Green variant |");
  lines.push("| `.bignum` | Large number with label underneath |");
  lines.push("| `.stat-grid` + `.stat-card` | Auto-fitting grid of stat cards |");
  lines.push("| `.compare` + `.compare-good` / `.compare-bad` | Side-by-side comparison |");
  lines.push("| `.accent-box` | Solid accent-coloured emphasis block |");
  lines.push("");
  lines.push("## Snippet registry");
  lines.push("");
  for (const tpl of TEMPLATES) {
    lines.push(formatSnippet(tpl));
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push(
    `_Auto-generated from \`src/templates.ts\` — ${TEMPLATES.length} snippets total._`
  );
  return lines.join("\n");
}
