---
theme: white
---

# Obsidian callouts

Use `> [!type]` — the same syntax as your notes.

Notes: All standard Obsidian callout types render as callout boxes in the
deck and the exported HTML. Colours and icons are driven by CSS variables,
so you can restyle any type per-deck.

---

## The common types

<div style="font-size: 0.7em">

> [!info] Information
> Bodies render full **markdown**, `code`, [links](https://obsidian.md), and lists.

> [!tip] Tip
> Flame icon, teal accent.

> [!warning] Heads up
> Amber. Aliases: `caution`, `attention`.

> [!danger] Critical
> Red. Aliases: `error`.

</div>

Notes: Type aliases group to the same colour (e.g. warning/caution/attention).

---

## Titles, defaults, and lists

<div style="font-size: 0.7em">

> [!success]
> No title given → the title defaults to the type ("Success").

> [!question] Can bodies hold structure?
> - Yes — lists,
> - **emphasis**,
> - and more.

> [!quote] A quote callout
> "Design is how it works." — someone

</div>

---

## Customising — escape hatches

Every callout is `<div class="callout" data-callout="type">` with an
overridable colour + icon. Drop this in a deck `<style>`:

```css
/* recolour one type */
.callout[data-callout="warning"] { --callout-color: 200, 120, 0; }
/* swap or hide the icon */
.callout[data-callout="tip"] .callout-icon { --callout-icon: "🚀"; }
.callout-icon { display: none; }        /* remove all icons */
/* restyle every callout title */
.callout-title { text-transform: uppercase; }
```

Notes: data-callout carries the literal type (even custom ones), so you can
target any type — including your own — with plain CSS. The "Render Obsidian
callouts" setting turns the whole feature off (back to plain blockquotes).

---

# Custom types work too

<div style="font-size: 0.72em">

> [!decision] Architecture decision
> Unknown types still render as a styleable box (neutral default) — then
> colour them however you like via `[data-callout="decision"]`.

</div>

Notes: This is the hook for future callout-plugin mapping.
