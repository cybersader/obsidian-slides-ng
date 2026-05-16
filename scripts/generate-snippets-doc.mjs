/**
 * v0.13.2: auto-generate the snippet reference docs from the
 * TEMPLATES registry. Run this whenever templates change so the
 * three sources of truth stay in lockstep:
 *
 *   1. src/templates.ts            — the runtime registry
 *   2. SNIPPETS.md                 — human-readable reference at repo root
 *   3. .claude/skills/slides-ng-snippets/SKILL.md
 *                                  — agent-facing version with frontmatter
 *
 * Both (2) and (3) use the SAME formatAllSnippets() implementation
 * the in-plugin "Copy all snippets" button uses, so users get
 * identical content whether they grab it from the plugin UI or from
 * the repo files.
 *
 * Usage:  bun run scripts/generate-snippets-doc.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Repo root is the parent of `scripts/`. fileURLToPath handles
// URL-encoded spaces in the path correctly.
const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = dirname(dirname(scriptPath));

const { formatAllSnippets } = await import(join(repoRoot, "src/snippetsDoc.ts"));

const body = formatAllSnippets();

// (1) SNIPPETS.md at repo root — human reference.
const snippetsMdPath = join(repoRoot, "SNIPPETS.md");
writeFileSync(snippetsMdPath, body + "\n");
console.log(`wrote ${snippetsMdPath} (${body.length} chars)`);

// (2) Agent-facing SKILL.md — same content, with frontmatter that
// Claude Code skills recognise. Trigger phrases listed so Claude
// auto-loads the skill when the user mentions snippets / slide
// layouts in a slides-ng workspace.
const skillDir = join(repoRoot, ".claude/skills/slides-ng-snippets");
mkdirSync(skillDir, { recursive: true });
const skillFrontmatter = [
  "---",
  "name: slides-ng-snippets",
  'description: Reference for slides-ng snippet vocabulary (hero, twocol, callout, bignum, …). Use when the user asks about slide layouts, snippet expansion, ::-name autocomplete, or HTML/shortcode rendering in the obsidian-slides-ng plugin.',
  "triggers:",
  '  - "slide snippet"',
  '  - "::hero"',
  '  - "::twocol"',
  '  - "::callout"',
  '  - "slides-ng layout"',
  '  - "how do I add a column"',
  "---",
  "",
].join("\n");
const skillPath = join(skillDir, "SKILL.md");
writeFileSync(skillPath, skillFrontmatter + body + "\n");
console.log(`wrote ${skillPath} (${(skillFrontmatter + body).length} chars)`);
