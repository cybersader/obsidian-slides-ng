---
theme: black
---

# Annotations

This deck demonstrates v0.3 slide + element annotations.

---

<!-- slide data-auto-animate -->

# Auto-animate (round 1)

<div data-id="box" style="width:100px; height:100px; background:steelblue;"></div>

---

<!-- slide data-auto-animate -->

# Auto-animate (round 2)

<div data-id="box" style="width:300px; height:300px; background:tomato;"></div>

Reveal.js morphs the `<div data-id="box">` between these two slides
because both sections carry `data-auto-animate`.

---

# Element fragments

The annotation below adds reveal.js's `fragment` class to the previous paragraph.

This paragraph appears on first click.
<!-- element class="fragment" -->

This one on the second click.
<!-- element class="fragment" -->

This one stays visible from the start.

---

<!-- slide class="custom-slide" data-id="end" -->

# Custom classes + IDs

The section tag for this slide has `class="custom-slide"` and `data-id="end"` — useful for theme overrides or per-slide CSS.
