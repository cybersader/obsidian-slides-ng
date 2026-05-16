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
  expand(): { text: string; cursorOffset: number };
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
  {
    name: "two-cols",
    description: "Two-column layout with ::left:: / ::right:: slots",
    expand: () =>
      withCursor(
        "---\nlayout: two-cols\n---\n\n::left::\n\n█\n\n::right::\n\n\n"
      ),
  },
  {
    name: "two-cols-header",
    description: "Two columns under a header (default slot is the header)",
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
  // v0.12.0 — HTML structural snippets using Pandoc fenced divs (`::: name`).
  //
  // These compose with reveal.js without requiring any custom parse-time
  // logic: marked treats `::: classname` as a `<div class="classname">`
  // wrapper, the body is parsed as normal markdown. CSS for each class
  // lives in src/render/revealTemplate.ts (so it ships inside the iframe)
  // and uses --r-link-color etc. so it picks up the active reveal theme.
  //
  // Convention rules:
  //  1. Always blank line after the opening `:::name` and before the
  //     closing `:::`. (Standard Pandoc behaviour.)
  //  2. Body content is regular markdown — paragraphs, headings, lists,
  //     code blocks all parse normally.
  //  3. em/fr/% units only inside the body — no fixed px. Reveal scales
  //     the whole slide; relative units keep proportions intact.
  //  4. For coloured accents prefer the .callout warn/danger/success
  //     variants over inline styles — they survive theme switches.
  // ===========================================================================

  {
    name: "hero",
    description: "Centred hero / cover title with subtitle",
    expand: () =>
      withCursor("::: hero\n\n# █\n\nSubtitle goes here\n\n:::\n"),
  },
  {
    name: "twocol",
    description: "Two equal columns (50/50)",
    expand: () =>
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
      withCursor("::: callout\n\n**Note:** █\n\n:::\n"),
  },
  {
    name: "callout-warn",
    description: "Amber warning callout",
    expand: () =>
      withCursor("::: { .callout .warn }\n\n**Warning:** █\n\n:::\n"),
  },
  {
    name: "callout-danger",
    description: "Red danger callout",
    expand: () =>
      withCursor("::: { .callout .danger }\n\n**Danger:** █\n\n:::\n"),
  },
  {
    name: "callout-success",
    description: "Green success callout",
    expand: () =>
      withCursor("::: { .callout .success }\n\n**Tip:** █\n\n:::\n"),
  },
  {
    name: "bignum",
    description: "Big number with a label below",
    expand: () =>
      withCursor(
        [
          "::: bignum",
          "",
          "█",
          "",
          "label / unit",
          "",
          ":::",
          "",
        ].join("\n")
      ),
  },
  {
    name: "stat-grid",
    description: "Auto-fitting grid of stat cards (number + label each)",
    expand: () =>
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
