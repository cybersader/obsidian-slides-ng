---
theme: black
---

# Slidev line-step info-string (M5 placeholder)

The `ts [1|2-3|all]` info-string after a triple-backtick fence is
Slidev's syntax for stepping through code line by line. M5 will parse
the bracket and emit reveal.js fragment sequences. For now (M4), the
info-string suffix must NOT break Shiki syntax highlighting.

```ts [1|2-3|all]
const passphrase = "four random words"
const length = passphrase.split(" ").length
console.log(`length is ${length}`)
```

The block above should still render with TypeScript token colours.

---

# Other Slidev info-string variants

Different bracket styles that should all degrade gracefully to plain
highlighting until M5.

```ts {*|2|3-4|all}
function add(a: number, b: number) {
  const sum = a + b
  console.log(sum)
  return sum
}
```

```ts {monaco-diff}
const oldName = "obsidian-slides"
const newName = "obsidian-slides-ng"
```
