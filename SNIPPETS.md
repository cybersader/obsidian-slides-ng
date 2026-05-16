# slides-ng snippet reference

Snippets for the [obsidian-slides-ng](https://github.com/cybersader/obsidian-slides-ng) plugin. Type `::` at the start of a line in a deck file and pick a name from the autocomplete — the snippet replaces the typed text with the expansion below.

## Authoring principle

Snippets emit raw HTML in the source file by default — the source IS the final form. No parse-time shortcode extension required downstream; any markdown tool with standard block-HTML support renders the slide correctly.

An experimental setting (`experimentalShortcodeSnippets`) switches insertions to the Pandoc fenced-div form (`::: name ... :::`) for users who prefer that style. Both forms render to the same `<div class="…">` at runtime via the bundled marked extension.

## CSS class catalog

All layout classes are pre-styled inside the deck iframe (`src/render/revealTemplate.ts`). Theme accents pull from reveal CSS vars (`--r-link-color`, `--r-main-color`, etc.) so swapping themes automatically reflows the snippet appearance.

| Class | Purpose |
|---|---|
| `.hero` | Centered title block — large H1 + subtitle |
| `.twocol` | Two equal columns (50/50) |
| `.twocol-60` | Two columns at 60/40 split |
| `.threecol` | Three equal columns |
| `.image-left` / `.image-right` | Image + text side-by-side |
| `.callout` | Side-bar block (accent color from theme) |
| `.callout.warn` | Amber variant |
| `.callout.danger` | Red variant |
| `.callout.success` | Green variant |
| `.bignum` | Large number with label underneath |
| `.stat-grid` + `.stat-card` | Auto-fitting grid of stat cards |
| `.compare` + `.compare-good` / `.compare-bad` | Side-by-side comparison |
| `.accent-box` | Solid accent-coloured emphasis block |

## Snippet registry

### `::note` — Speaker note (HTML comment block)

**HTML expansion (default):**

```markdown
<!--

-->
```

### `::cover` — Cover-layout slide (centered title + subtitle)

**HTML expansion (default):**

```markdown
---
layout: cover
---

# 

Subtitle
```

### `::center` — Center-layout slide (vertically + horizontally centered)

**HTML expansion (default):**

```markdown
---
layout: center
---

##
```

### `::slidev-two-cols` — Slide-WIDE two-column layout (Slidev style, uses `layout:` frontmatter)

**HTML expansion (default):**

```markdown
---
layout: two-cols
---

::left::



::right::
```

### `::slidev-two-cols-header` — Slide-WIDE two-cols with header above (Slidev style, uses `layout:` frontmatter)

**HTML expansion (default):**

```markdown
---
layout: two-cols-header
---

# 

::left::



::right::
```

### `::quote` — Large blockquote slide

**HTML expansion (default):**

```markdown
---
layout: quote
---

> 
>
> — attribution
```

### `::statement` — Single emphasised statement slide

**HTML expansion (default):**

```markdown
---
layout: statement
---
```

### `::section` — Section/chapter divider slide

**HTML expansion (default):**

```markdown
---
layout: section
---

#
```

### `::end` — Closing slide

**HTML expansion (default):**

```markdown
---
layout: end
---

#
```

### `::auto-animate` — Auto-animate slide pair (morphing data-id box)

**HTML expansion (default):**

```markdown
<!-- slide data-auto-animate -->

# Step 1

<div data-id="" style="width:100px;height:100px;background:steelblue;"></div>

---

<!-- slide data-auto-animate -->

# Step 2

<div data-id="box" style="width:300px;height:300px;background:tomato;"></div>
```

### `::v-clicks` — Click-reveal list (each item appears on click)

**HTML expansion (default):**

```markdown
<v-clicks>

- 
- 
- 

</v-clicks>
```

### `::v-click` — Single click reveal wrapping one element

**HTML expansion (default):**

```markdown
<v-click></v-click>
```

### `::fragment` — Element annotation: turn the next paragraph into a fragment

**HTML expansion (default):**

```markdown

<!-- element class="fragment" -->
```

### `::code-ts` — TypeScript code block (Shiki syntax-highlighted)

**HTML expansion (default):**

```markdown
```ts

```
```

### `::code-step` — TypeScript code block with line-stepping `[1|2-3|all]`

**HTML expansion (default):**

```markdown
```ts [1|2-3|all]
const passphrase = ""
const length = passphrase.split(" ").length
console.log(`length is ${length}`)
```
```

### `::hero` — Centred hero / cover title with subtitle

**HTML expansion (default):**

```markdown
<div class="hero">
<h1></h1>
<p>Subtitle goes here</p>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: hero

# 

Subtitle goes here

:::
```

### `::twocol` — Two equal columns (50/50)

**HTML expansion (default):**

```markdown
<div class="twocol">
<div>
<h2>Left heading</h2>
<p></p>
</div>
<div>
<h2>Right heading</h2>
<p></p>
</div>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: twocol

:::: { }

## Left heading



::::

:::: { }

## Right heading



::::

:::
```

### `::twocol-60` — Two columns 60/40 (wider left)

**HTML expansion (default):**

```markdown
<div class="twocol-60">
<div>
<h2>Main</h2>
<p></p>
</div>
<div>
<h2>Aside</h2>
<p></p>
</div>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: twocol-60

:::: { }

## Main



::::

:::: { }

## Aside



::::

:::
```

### `::threecol` — Three equal columns

**HTML expansion (default):**

```markdown
<div class="threecol">
<div>
<h3>One</h3>
<p></p>
</div>
<div>
<h3>Two</h3>
<p></p>
</div>
<div>
<h3>Three</h3>
<p></p>
</div>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: threecol

:::: { }

### One



::::

:::: { }

### Two



::::

:::: { }

### Three



::::

:::
```

### `::image-left` — Image on the left, text on the right

**HTML expansion (default):**

```markdown
<div class="image-left">
<img src="" alt="">
<div>
<h2>Heading</h2>
<p>Text body alongside the image.</p>
</div>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: image-left

![]()

:::: { }

## Heading

Text body alongside the image.

::::

:::
```

### `::image-right` — Image on the right, text on the left

**HTML expansion (default):**

```markdown
<div class="image-right">
<img src="" alt="">
<div>
<h2>Heading</h2>
<p>Text body alongside the image.</p>
</div>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: image-right

![]()

:::: { }

## Heading

Text body alongside the image.

::::

:::
```

### `::callout` — Coloured side-bar callout (theme link colour)

**HTML expansion (default):**

```markdown
<div class="callout">
<p><strong>Note:</strong> </p>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: callout

**Note:** 

:::
```

### `::callout-warn` — Amber warning callout

**HTML expansion (default):**

```markdown
<div class="callout warn">
<p><strong>Warning:</strong> </p>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: { .callout .warn }

**Warning:** 

:::
```

### `::callout-danger` — Red danger callout

**HTML expansion (default):**

```markdown
<div class="callout danger">
<p><strong>Danger:</strong> </p>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: { .callout .danger }

**Danger:** 

:::
```

### `::callout-success` — Green success callout

**HTML expansion (default):**

```markdown
<div class="callout success">
<p><strong>Tip:</strong> </p>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: { .callout .success }

**Tip:** 

:::
```

### `::bignum` — Big number with a label below

**HTML expansion (default):**

```markdown
<div class="bignum">
<p></p>
<p>label / unit</p>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: bignum



label / unit

:::
```

### `::stat-grid` — Auto-fitting grid of stat cards (number + label each)

**HTML expansion (default):**

```markdown
<div class="stat-grid">
<div class="stat-card">
<p></p>
<p>users</p>
</div>
<div class="stat-card">
<p></p>
<p>uptime</p>
</div>
<div class="stat-card">
<p></p>
<p>p99</p>
</div>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: stat-grid

:::: stat-card



users

::::

:::: stat-card



uptime

::::

:::: stat-card



p99

::::

:::
```

### `::compare` — Side-by-side comparison with divider

**HTML expansion (default):**

```markdown
<div class="compare">
<div class="compare-good">
<h3>Good</h3>
<p></p>
</div>
<div class="compare-bad">
<h3>Avoid</h3>
<p></p>
</div>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: compare

:::: compare-good

### Good



::::

:::: compare-bad

### Avoid



::::

:::
```

### `::accent-box` — Solid accent-coloured emphasis block

**HTML expansion (default):**

```markdown
<div class="accent-box">
<h1></h1>
</div>
```

**Shortcode expansion (experimental, opt-in):**

```markdown
::: accent-box

# 

:::
```

---

_Auto-generated from `src/templates.ts` — 29 snippets total._
