---
theme: simple
---

# Inline HTML elements

A paragraph with <em>emphasis</em>, <strong>strong</strong>, and
<code>inline code</code> as raw HTML.

<div class="custom-class">A raw &lt;div&gt; with a class.</div>

---

# Styled blocks

<div style="background: steelblue; color: white; padding: 1rem; border-radius: 4px;">
  Box with inline styles.
</div>

<p style="text-align: center; font-size: 0.8em; opacity: 0.7;">
  Center-aligned smaller paragraph.
</p>

---

# Embedded SVG

<svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <circle cx="60" cy="60" r="50" fill="tomato" />
</svg>

---

# `<style>` block (deck-scoped)

<style>
  .pulse-box {
    background: gold;
    padding: 0.5rem 1rem;
    display: inline-block;
    border-radius: 999px;
  }
</style>

<span class="pulse-box">Styled by the deck's own &lt;style&gt; block.</span>
