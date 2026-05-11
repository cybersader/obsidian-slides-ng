# WebContainers — future research log

**Status:** Rejected for v0.x. Logged for future-revisit only.
**Logged:** 2026-05-11

## The idea

[StackBlitz WebContainers](https://webcontainers.io/) is a Node.js runtime
compiled to WebAssembly. It runs entirely inside a browser tab (or, in our
case, the Electron renderer that hosts Obsidian) — `npm install`, `vite dev`,
even full Vite-based applications all work, without ever spawning a real OS
process or opening a real listening port (the dev server "listens" on a
WebContainer-internal virtual port that's only addressable from inside the
WebContainer itself).

In principle, this is the **only known route** that would let us bundle
the *real, unmodified* Slidev (a Vue 3 + Vite application) into Obsidian and
get 100% Slidev fidelity inside the plugin, while still satisfying:

- ✅ No OS-level listening localhost port (the port is virtual to the WebContainer)
- ✅ No spawned child process (Node runs in WASM, in-process)
- ✅ No separate Node install on the user's machine

## Why we rejected it for v0.x

Three independent blockers:

### 1. Licensing

WebContainers is licensed by StackBlitz under custom terms:

- Free for personal use, open-source projects, and educational use
- Commercial use requires a paid license
- The definition of "commercial use" is ambiguous when the WebContainer is
  embedded inside a third-party application (Obsidian) that some users use
  commercially

For an MIT plugin submitted to the official Obsidian community-plugin catalog,
this is the kind of thing that gets caught in legal review. The plugin would
need a clear statement of its own usage rights, and StackBlitz's terms make
that statement hard to write.

### 2. Bundle size

WebContainers runtime is roughly **10–15 MB compressed**. Our project soft cap
is **2 MB for the entire `main.js`**. WebContainers alone would be 5–7× over
budget, before we add Slidev, reveal.js, Shiki, themes, etc.

### 3. Complexity / maintainability

The stack would be: Obsidian (Electron) → renderer → iframe → WebContainer
(WASM Node) → Vite dev server → Slidev → Vue runtime → rendered slide DOM.
Every layer multiplies startup time, RAM cost, and debuggability problems.
Diagnosing "the slide flashes blank for 200ms" through that stack is a
nightmare.

## When this might be worth revisiting

A future scenario where WebContainers becomes interesting:

- StackBlitz changes the licensing model (e.g., explicit per-redistribution
  carve-out for embedded use)
- The runtime size drops dramatically (currently it's a near-complete Node
  port; future minimization could matter)
- Slidev itself ships a "no-Vite" runtime path (the maintainers have hinted
  at this on Discord but it's not concrete)
- The Obsidian community catalog explicitly approves a similar pattern in a
  different plugin (validates the licensing path)
- We hit a hard wall on parity with the bundled-libs approach and the only
  remaining 15% of Slidev features users want require the actual Slidev
  runtime

## Alternative we chose instead

Bundle the standalone Slidev *libraries* (`@slidev/parser`,
`shiki-magic-move`, theme CSS) into our plugin, and re-implement everything
that needs the Vue+Vite runtime on top of reveal.js + Shiki.

See `PROJECT_BRIEF.md` §3 and §4 for the chosen approach.

## References

- https://webcontainers.io/ — official site + docs
- https://webcontainers.io/guides/licensing — licensing terms (read carefully)
- https://blog.stackblitz.com/posts/introducing-webcontainers/ — launch post
- https://github.com/stackblitz/webcontainer-core — open-source surface
