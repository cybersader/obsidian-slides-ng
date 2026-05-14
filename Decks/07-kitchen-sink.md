---
slides-ng-theme: black
slides-ng-transition: slide
slides-ng-code-theme: github-dark
slides-ng-magic-move-duration: 600
title: "Kitchen sink — every feature in one deck"
---

# Kitchen sink

Every feature slides-ng supports, in one deck. Use this for testing.

<!-- slide: notes="Demo deck for plugin features. Walk through each section." -->

---

## Headings + text

### Subheading

A paragraph with **bold**, *italic*, `inline code`, and a [link](https://obsidian.md).

> A blockquote.
> Multiple lines.

---

## Ordered + unordered lists

1. Numbered item
2. Another numbered item
3. Third

- Bullet
- Another bullet
  - Nested
  - Also nested
- Back to top level

---

## Vertical slides

This is a HORIZONTAL slide. Press DOWN to go vertical.

----

### Vertical 1

The down-arrow nav takes you here.

----

### Vertical 2

And one more down.

----

### Vertical 3

Press RIGHT to leave the vertical stack.

---

## Code block (Shiki highlighted)

```ts
interface User {
  id: string
  name: string
  createdAt: Date
}

const users: User[] = [
  { id: "1", name: "Ada", createdAt: new Date("2024-01-01") },
]
```

---

## Code line-stepping

Press SPACE / RIGHT to advance through highlighted lines.

```python [1|2-3|4-5|all]
def fibonacci(n):
    if n < 2:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
```

---

## v-click reveal

[Slide content reveals one element at a time]<!-- .element: class="fragment" -->

[Press SPACE to advance.]<!-- .element: class="fragment" -->

[Each fragment becomes visible in order.]<!-- .element: class="fragment" -->

---

## Magic Move

The same function across slides — watch it morph.

```ts {data-mm-key="example"}
function greet(name) {
  return "Hello " + name
}
```

---

## Magic Move (after)

```ts {data-mm-key="example"}
function greet(name: string): string {
  const greeting = `Hello, ${name}!`
  return greeting
}
```

<!-- slide: notes="Reveal advances from previous slide — same key, tokens morph in place." -->

---

## Tables

| Feature        | Status   | Notes                |
|----------------|----------|----------------------|
| Themes         | Done     | 15 bundled           |
| Magic Move     | Done     | shiki-magic-move     |
| Speaker view   | Done     | In-Obsidian + remote |
| PDF export     | Done     | print-pdf flow       |
| Free-grid panels | Idea   | Future               |

---

## Blockquote with attribution

> The best time to plant a tree was 20 years ago. The second best time is now.

— Chinese proverb

---

## HTML inside markdown

<div style="color: #f9c74f; font-size: 1.2em; text-align: center;">
  Inline HTML works for one-off styling.
</div>

(But prefer `customCSS:` frontmatter for anything reusable.)

---

## Footnote-style sidebar

Main content on the left.

<aside style="color: #888; font-size: 0.8em">
  This sidebar uses inline HTML for a quick layout.
  Better long-term: a layout in customCSS.
</aside>

---

## Speaker notes

Open the speaker view (toolbar → Speaker, or command) and you'll see notes here.

<!-- slide: notes="These notes appear in the speaker view's notes panel. Editable in v0.8.2+ — click Edit to modify in place." -->

---

# That's the kitchen sink

Open speaker view to see all the bells and whistles.
