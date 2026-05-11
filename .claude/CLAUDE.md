# Claude Instructions — obsidian-slides-ng

> **Read `PROJECT_BRIEF.md` at the project root FIRST.** That doc has the full mission, architecture decisions, what-was-rejected-and-why, acceptance criteria, and phase plan. This file is the operational layer that sits on top of the brief.

## What this project is

A lightweight Obsidian plugin (`slides-ng`) that renders markdown slide decks **without a localhost server, child process, or external runtime**. Single-file `main.js` output. See `PROJECT_BRIEF.md` for full context.

## Workspace conventions you inherit

Read these in the workspace root (`plugin_development/`):

- `.claude/CLAUDE.md` — workspace-level guidance (23 KB; covers Claude's blind spots when developing Obsidian plugins)
- `OBSIDIAN_TESTING_LIMITATIONS.md` — what Claude can / can't see (console output, UI, runtime behavior — all invisible without explicit user reporting or file-based logging)
- `LLM_DEVELOPMENT_WORKFLOW.md` — the user's preferred LLM-assisted dev loop
- `OBSIDIAN_PLUGIN_PUBLISHING.md` — community-plugin submission flow

## Sibling plugin to model after

`obsidian-daily-notes-ng/` is the closest pattern match. Mirror its:

- `package.json` (bun-based, dependencies declared, scripts)
- `esbuild.config.mjs` (bundle config)
- `copy-files.mjs` (test-vault hot-reload pattern)
- `.github/workflows/release.yml` (tag-triggered release)
- `manifest.json` shape

## Stack

- **TypeScript** + **bun** (NOT npm/pnpm/yarn)
- **esbuild** for bundling — bundle `reveal.js` + `shiki` directly into `main.js`
- **bun test** for unit tests (NOT jest)
- **eslint** + **prettier** per the existing user configs

## What Claude can't see — design for it

- Obsidian's developer console: invisible to Claude. Write a `debug.log` file in the plugin folder if you need to capture runtime info.
- Obsidian UI: invisible. Ask the user to screenshot or describe.
- Runtime behavior: invisible. Plan testable code with unit-testable pure functions where possible.

## Dev workflow (vault-as-dev-environment)

The project root IS the dev vault. No separate `test-vault/` subdir.

1. `bun install` (one-time)
2. `bun run dev` — esbuild watches `src/`, writes `main.js` directly to `./.obsidian/plugins/slides-ng/main.js`
3. Open this project folder itself in Obsidian as a vault
4. Enable the **Hot Reload** community plugin in this vault (auto-reloads on `main.js` mtime change)
5. Make code changes → see them in <2s
6. Test decks live at `./Decks/*.md`

esbuild also copies `./manifest.json` and `./styles.css` to `./.obsidian/plugins/slides-ng/` on each build so manifest sync is automatic. Repo-root copies are the source of truth (where the release action grabs them from).

## Coding conventions

- **No `child_process.spawn` / `exec`** — ever. This is a hard constraint, not a preference.
- **No HTTP server** — neither bundled (`http.createServer`) nor spawned. The plugin is iframe-srcdoc-only.
- **No CDN at runtime** — bundle everything into `main.js`. The plugin works offline.
- **Strict TypeScript** — `strict: true` in tsconfig, no `any` without explicit `// @ts-expect-error: <reason>` comment.
- **Pure functions where possible** — parser and renderer should be testable in isolation (no Obsidian API mocking needed for them).
- **No AI co-author lines in git commits** (workspace-level rule, enforced by `commit-msg` hook).

## Local search infrastructure

The user has built a cross-project semantic+lexical search system. When you need to look across their projects or vaults:

```bash
source "/mnt/c/Users/Cybersader/Documents/1 Projects, Workspaces/mcp-workflow-and-tech-stack/profiles/bashrc-snippets/local-search-helpers.sh"

cks-list                                              # 37 registered project trees
cks "literal pattern"                                 # regex/literal fan-out (fast)
cks-sem "concept query"                               # semantic fan-out (slow first time per tree)
ck "pattern" /single/path                             # bare ck on a single tree
obs-search "query" 20                                 # Obsidian vault search
obs-search-context "query" 20                         # with line context
```

**Do NOT use `find` or `grep` for content searches** — workspace convention saved as a memory at `~/.claude/projects/.../memory/feedback_prefer_local_search_over_find.md`. Use `find` only for known-path filesystem ops (stat, ls, mkdir).

## Public repo

- GitHub remote: `https://github.com/cybersader/obsidian-slides-ng`
- Visibility: **public from day one** (user requested this)
- License: MIT
- Tag-triggered GitHub Action for releases (model after sibling's `release.yml`)

## When the user asks questions

- They are not a beginner. Don't over-explain.
- They prefer brief responses (per memory). Match the question's length.
- Show command outputs and let them inspect; don't summarize away the details.
- Surface non-obvious decisions for confirmation; don't ask about routine things.

## Pre-flight checklist before writing any code

1. Read `PROJECT_BRIEF.md` — all of it
2. Read this file (you're doing that now)
3. Read `../OBSIDIAN_TESTING_LIMITATIONS.md`
4. Skim `../obsidian-daily-notes-ng/package.json` + `esbuild.config.mjs` (your build pattern source)
5. Confirm with the user which phase (M1-M8 per PROJECT_BRIEF §10) they want started

Then start. Update `PROJECT_BRIEF.md` whenever decisions are made or refined — it's the source of truth.
