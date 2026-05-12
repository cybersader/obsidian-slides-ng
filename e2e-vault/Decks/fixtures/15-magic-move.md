---
theme: black
---

# Magic-Move (v0.4)

Paired code blocks across consecutive slides with the same `{key=...}`
get smooth token-morph animations courtesy of `shiki-magic-move`.

---

```ts {key=passphrase}
const passphrase = "four random words"
```

---

```ts {key=passphrase}
const passphrase = "four random words"
const length = passphrase.split(" ").length
```

---

```ts {key=passphrase}
const passphrase = "four random words"
const length = passphrase.split(" ").length
console.log(`length is ${length}`)
```

---

# Plain (no key) — no morph

```ts
const a = 1
const b = 2
```

---

# Different key — different sequence

```js {key=other}
function add(a, b) {
  return a + b
}
```
