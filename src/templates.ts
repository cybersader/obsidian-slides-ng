/**
 * Snippet/template registry for the `::name` summon menu.
 *
 * When a user types `::` at the start of a line and selects a template
 * from the dropdown, the typed `::name` is fully REPLACED by the
 * template's expansion text. The expansion is plain markdown — the
 * renderer doesn't know a snippet was used.
 *
 * Adding a new snippet: append an entry below. Each entry declares:
 *   - `name`     identifier; appears in the dropdown
 *   - `description` shown as the dropdown sublabel
 *   - `expand()` returns `{ text, cursorOffset }` where `text` is the
 *     full multi-line expansion and `cursorOffset` is the 0-based char
 *     offset (within `text`) where the cursor should land after the
 *     replacement.
 *
 * Multi-line cursor positioning is computed by `locateCursor` below.
 */

export interface SnippetTemplate {
  name: string;
  description: string;
  /**
   * Default expansion. v0.13.0+: returns raw HTML for layout
   * snippets so the source file is the final form — no parse-time
   * shortcode extension needed downstream. Non-layout templates
   * (note, cover, code blocks, etc.) emit plain markdown as before.
   */
  expand(): { text: string; cursorOffset: number };
  /**
   * Optional Pandoc-style fenced-div expansion (`::: classname …
   * :::`). Only the structural layout snippets define this. Caller
   * uses it instead of `expand()` when the user opts into
   * `experimentalShortcodeSnippets` in settings.
   */
  expandShortcode?(): { text: string; cursorOffset: number };
}

/** Place a `█` in the snippet body to mark where the cursor should land. */
function withCursor(text: string): { text: string; cursorOffset: number } {
  const cursor = "█";
  const idx = text.indexOf(cursor);
  if (idx === -1) {
    return { text, cursorOffset: text.length };
  }
  return { text: text.slice(0, idx) + text.slice(idx + cursor.length), cursorOffset: idx };
}

export const TEMPLATES: readonly SnippetTemplate[] = [
  {
    name: "note",
    description: "Speaker note (HTML comment block)",
    expand: () => withCursor("<!--\n█\n-->"),
  },
  {
    name: "cover",
    description: "Cover-layout slide (centered title + subtitle)",
    expand: () =>
      withCursor("---\nlayout: cover\n---\n\n# █\n\nSubtitle\n"),
  },
  {
    name: "center",
    description: "Center-layout slide (vertically + horizontally centered)",
    expand: () => withCursor("---\nlayout: center\n---\n\n## █\n"),
  },
  // v0.13.0: renamed `two-cols` → `slidev-two-cols` to disambiguate
  // from the new HTML-emitting `::twocol` snippet. Slidev names use
  // the SLIDE-WIDE layout system (parse-time `layout:` frontmatter
  // + `::left::` / `::right::` slot markers). The inline HTML
  // `::twocol` snippet is usually what users actually want — it
  // drops a two-column block INSIDE a slide without taking over the
  // whole slide layout.
  {
    name: "slidev-two-cols",
    description: "Slide-WIDE two-column layout (Slidev style, uses `layout:` frontmatter)",
    expand: () =>
      withCursor(
        "---\nlayout: two-cols\n---\n\n::left::\n\n█\n\n::right::\n\n\n"
      ),
  },
  {
    name: "slidev-two-cols-header",
    description: "Slide-WIDE two-cols with header above (Slidev style, uses `layout:` frontmatter)",
    expand: () =>
      withCursor(
        "---\nlayout: two-cols-header\n---\n\n# █\n\n::left::\n\n\n\n::right::\n\n\n"
      ),
  },
  {
    name: "quote",
    description: "Large blockquote slide",
    expand: () =>
      withCursor("---\nlayout: quote\n---\n\n> █\n>\n> — attribution\n"),
  },
  {
    name: "statement",
    description: "Single emphasised statement slide",
    expand: () => withCursor("---\nlayout: statement\n---\n\n█\n"),
  },
  {
    name: "section",
    description: "Section/chapter divider slide",
    expand: () => withCursor("---\nlayout: section\n---\n\n# █\n"),
  },
  {
    name: "end",
    description: "Closing slide",
    expand: () => withCursor("---\nlayout: end\n---\n\n# █\n"),
  },
  {
    name: "auto-animate",
    description: "Auto-animate slide pair (morphing data-id box)",
    expand: () =>
      withCursor(
        '<!-- slide data-auto-animate -->\n\n# Step 1\n\n<div data-id="█" style="width:100px;height:100px;background:steelblue;"></div>\n\n---\n\n<!-- slide data-auto-animate -->\n\n# Step 2\n\n<div data-id="box" style="width:300px;height:300px;background:tomato;"></div>\n'
      ),
  },
  {
    name: "v-clicks",
    description: "Click-reveal list (each item appears on click)",
    expand: () => withCursor("<v-clicks>\n\n- █\n- \n- \n\n</v-clicks>\n"),
  },
  {
    name: "v-click",
    description: "Single click reveal wrapping one element",
    expand: () => withCursor("<v-click>█</v-click>"),
  },
  {
    name: "fragment",
    description: "Element annotation: turn the next paragraph into a fragment",
    expand: () => withCursor("█\n<!-- element class=\"fragment\" -->\n"),
  },
  {
    name: "code-ts",
    description: "TypeScript code block (Shiki syntax-highlighted)",
    expand: () => withCursor("```ts\n█\n```\n"),
  },
  {
    name: "code-step",
    description: "TypeScript code block with line-stepping `[1|2-3|all]`",
    expand: () =>
      withCursor(
        '```ts [1|2-3|all]\nconst passphrase = "█"\nconst length = passphrase.split(" ").length\nconsole.log(`length is ${length}`)\n```\n'
      ),
  },

  // ===========================================================================
  // v0.12.0 / v0.13.0 — layout snippets.
  //
  // DEFAULT (expand): raw HTML in the source file. Markup-foundations
  // principle: the source IS the expanded form — no parse-time
  // shortcode extension needed. Any markdown tool that supports block
  // HTML (every CommonMark-compliant one) renders these.
  //
  // EXPERIMENTAL (expandShortcode): Pandoc fenced-div form (`::: classname
  // ... :::`). Cleaner source, lets you write markdown inside without
  // <h2>/<p> tags, but requires the marked extension to render.
  //
  // CSS for each class lives in src/render/revealTemplate.ts and uses
  // reveal CSS vars (--r-link-color etc.) so accents follow the theme.
  // Both forms produce identical rendered output — same .hero, .twocol,
  // .callout etc. classes get applied either way.
  // ===========================================================================

  {
    name: "hero",
    description: "Centred hero / cover title with subtitle",
    expand: () =>
      withCursor(
        '<div class="hero">\n<h1>█</h1>\n<p>Subtitle goes here</p>\n</div>\n'
      ),
    expandShortcode: () =>
      withCursor("::: hero\n\n# █\n\nSubtitle goes here\n\n:::\n"),
  },
  {
    name: "twocol",
    description: "Two equal columns (50/50)",
    expand: () =>
      withCursor(
        [
          '<div class="twocol">',
          "<div>",
          "<h2>Left heading</h2>",
          "<p>█</p>",
          "</div>",
          "<div>",
          "<h2>Right heading</h2>",
          "<p></p>",
          "</div>",
          "</div>",
          "",
        ].join("\n")
      ),
    expandShortcode: () =>
      withCursor(
        [
          "::: twocol",
          "",
          ":::: { }",
          "",
          "## Left heading",
          "",
          "█",
          "",
          "::::",
          "",
          ":::: { }",
          "",
          "## Right heading",
          "",
          "",
          "",
          "::::",
          "",
          ":::",
          "",
        ].join("\n")
      ),
  },
  {
    name: "twocol-60",
    description: "Two columns 60/40 (wider left)",
    expand: () =>
      withCursor(
        [
          '<div class="twocol-60">',
          "<div>",
          "<h2>Main</h2>",
          "<p>█</p>",
          "</div>",
          "<div>",
          "<h2>Aside</h2>",
          "<p></p>",
          "</div>",
          "</div>",
          "",
        ].join("\n")
      ),
    expandShortcode: () =>
      withCursor(
        [
          "::: twocol-60",
          "",
          ":::: { }",
          "",
          "## Main",
          "",
          "█",
          "",
          "::::",
          "",
          ":::: { }",
          "",
          "## Aside",
          "",
          "",
          "",
          "::::",
          "",
          ":::",
          "",
        ].join("\n")
      ),
  },
  {
    name: "threecol",
    description: "Three equal columns",
    expand: () =>
      withCursor(
        [
          '<div class="threecol">',
          "<div>",
          "<h3>One</h3>",
          "<p>█</p>",
          "</div>",
          "<div>",
          "<h3>Two</h3>",
          "<p></p>",
          "</div>",
          "<div>",
          "<h3>Three</h3>",
          "<p></p>",
          "</div>",
          "</div>",
          "",
        ].join("\n")
      ),
    expandShortcode: () =>
      withCursor(
        [
          "::: threecol",
          "",
          ":::: { }",
          "",
          "### One",
          "",
          "█",
          "",
          "::::",
          "",
          ":::: { }",
          "",
          "### Two",
          "",
          "",
          "",
          "::::",
          "",
          ":::: { }",
          "",
          "### Three",
          "",
          "",
          "",
          "::::",
          "",
          ":::",
          "",
        ].join("\n")
      ),
  },
  {
    name: "image-left",
    description: "Image on the left, text on the right",
    expand: () =>
      withCursor(
        [
          '<div class="image-left">',
          '<img src="█" alt="">',
          "<div>",
          "<h2>Heading</h2>",
          "<p>Text body alongside the image.</p>",
          "</div>",
          "</div>",
          "",
        ].join("\n")
      ),
    expandShortcode: () =>
      withCursor(
        [
          "::: image-left",
          "",
          "![](█)",
          "",
          ":::: { }",
          "",
          "## Heading",
          "",
          "Text body alongside the image.",
          "",
          "::::",
          "",
          ":::",
          "",
        ].join("\n")
      ),
  },
  {
    name: "image-right",
    description: "Image on the right, text on the left",
    expand: () =>
      withCursor(
        [
          '<div class="image-right">',
          '<img src="█" alt="">',
          "<div>",
          "<h2>Heading</h2>",
          "<p>Text body alongside the image.</p>",
          "</div>",
          "</div>",
          "",
        ].join("\n")
      ),
    expandShortcode: () =>
      withCursor(
        [
          "::: image-right",
          "",
          "![](█)",
          "",
          ":::: { }",
          "",
          "## Heading",
          "",
          "Text body alongside the image.",
          "",
          "::::",
          "",
          ":::",
          "",
        ].join("\n")
      ),
  },
  {
    name: "callout",
    description: "Coloured side-bar callout (theme link colour)",
    expand: () =>
      withCursor(
        '<div class="callout">\n<p><strong>Note:</strong> █</p>\n</div>\n'
      ),
    expandShortcode: () =>
      withCursor("::: callout\n\n**Note:** █\n\n:::\n"),
  },
  {
    name: "callout-warn",
    description: "Amber warning callout",
    expand: () =>
      withCursor(
        '<div class="callout warn">\n<p><strong>Warning:</strong> █</p>\n</div>\n'
      ),
    expandShortcode: () =>
      withCursor("::: { .callout .warn }\n\n**Warning:** █\n\n:::\n"),
  },
  {
    name: "callout-danger",
    description: "Red danger callout",
    expand: () =>
      withCursor(
        '<div class="callout danger">\n<p><strong>Danger:</strong> █</p>\n</div>\n'
      ),
    expandShortcode: () =>
      withCursor("::: { .callout .danger }\n\n**Danger:** █\n\n:::\n"),
  },
  {
    name: "callout-success",
    description: "Green success callout",
    expand: () =>
      withCursor(
        '<div class="callout success">\n<p><strong>Tip:</strong> █</p>\n</div>\n'
      ),
    expandShortcode: () =>
      withCursor("::: { .callout .success }\n\n**Tip:** █\n\n:::\n"),
  },
  {
    name: "bignum",
    description: "Big number with a label below",
    expand: () =>
      withCursor(
        '<div class="bignum">\n<p>█</p>\n<p>label / unit</p>\n</div>\n'
      ),
    expandShortcode: () =>
      withCursor(
        ["::: bignum", "", "█", "", "label / unit", "", ":::", ""].join("\n")
      ),
  },
  {
    name: "stat-grid",
    description: "Auto-fitting grid of stat cards (number + label each)",
    expand: () =>
      withCursor(
        [
          '<div class="stat-grid">',
          '<div class="stat-card">',
          "<p>█</p>",
          "<p>users</p>",
          "</div>",
          '<div class="stat-card">',
          "<p></p>",
          "<p>uptime</p>",
          "</div>",
          '<div class="stat-card">',
          "<p></p>",
          "<p>p99</p>",
          "</div>",
          "</div>",
          "",
        ].join("\n")
      ),
    expandShortcode: () =>
      withCursor(
        [
          "::: stat-grid",
          "",
          ":::: stat-card",
          "",
          "█",
          "",
          "users",
          "",
          "::::",
          "",
          ":::: stat-card",
          "",
          "",
          "",
          "uptime",
          "",
          "::::",
          "",
          ":::: stat-card",
          "",
          "",
          "",
          "p99",
          "",
          "::::",
          "",
          ":::",
          "",
        ].join("\n")
      ),
  },
  {
    name: "compare",
    description: "Side-by-side comparison with divider",
    expand: () =>
      withCursor(
        [
          '<div class="compare">',
          '<div class="compare-good">',
          "<h3>Good</h3>",
          "<p>█</p>",
          "</div>",
          '<div class="compare-bad">',
          "<h3>Avoid</h3>",
          "<p></p>",
          "</div>",
          "</div>",
          "",
        ].join("\n")
      ),
    expandShortcode: () =>
      withCursor(
        [
          "::: compare",
          "",
          ":::: compare-good",
          "",
          "### Good",
          "",
          "█",
          "",
          "::::",
          "",
          ":::: compare-bad",
          "",
          "### Avoid",
          "",
          "",
          "",
          "::::",
          "",
          ":::",
          "",
        ].join("\n")
      ),
  },
  {
    name: "accent-box",
    description: "Solid accent-coloured emphasis block",
    expand: () =>
      withCursor('<div class="accent-box">\n<h1>█</h1>\n</div>\n'),
    expandShortcode: () =>
      withCursor("::: accent-box\n\n# █\n\n:::\n"),
  },
];

/** Look up a template by exact name. */
export function findTemplate(name: string): SnippetTemplate | undefined {
  return TEMPLATES.find((t) => t.name === name);
}

/** Compute the {line, ch} position for a cursor offset within multi-line text. */
export function locateCursor(
  startLine: number,
  text: string,
  offset: number
): { line: number; ch: number } {
  let line = startLine;
  let ch = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      ch = 0;
    } else {
      ch++;
    }
  }
  return { line, ch };
}
