---
slides-ng: true
theme: simple
transition: fade
---

# Slides NG

A markdown deck rendered inside Obsidian.

<!--
This is a speaker note. It's an HTML comment. Reveal.js will show it
in the speaker view when you press `S` in the standalone browser export.
-->

---

# No localhost. No spawned server.

The whole deck renders via `<iframe srcdoc>` inside Obsidian.

Press the "Open in browser" toolbar button to launch a fullscreen
presentation — that uses `file://` with `shell.openExternal()`, also
without any port.

---

# Slidev-style click reveals

<v-clicks>

- First click reveals this
- Second click reveals this
- Third click reveals this

</v-clicks>

---

# Code with line stepping

```ts [1|2-3|all]
const passphrase = "four random words"
const length = passphrase.split(" ").length
console.log(`length is ${length}`)
```

<!--
Speaker notes: walk through why a passphrase beats `Tr0ub4dor!` —
length over complexity, no character class headaches, easier to type.
-->

---

# Auto-animate (reveal.js native)

<!-- slide data-auto-animate -->

<div data-id="box" style="width:100px; height:100px; background:steelblue;"></div>

---

<!-- slide data-auto-animate -->

# Auto-animate (reveal.js native)

<div data-id="box" style="width:300px; height:300px; background:tomato;"></div>

<!--
Speaker notes: matching `data-id` attributes on two consecutive slides
make reveal.js morph the element between them. Position, size, color
all interpolate. Closest thing to Magic-Move that pure-markdown can give.
-->

---

# That's it

A whole deck rendered with no localhost port, no spawned process,
and no external runtime requirement.
