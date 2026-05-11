---
theme: black
---

# TypeScript

```ts
type Greeting = "hello" | "hi"
const say = (g: Greeting): string => `${g}, world`
console.log(say("hello"))
```

---

# JavaScript

```js
function fib(n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2)
}
console.log(fib(10))
```

---

# Python

```py
def fib(n: int) -> int:
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print(fib(10))
```

---

# Bash

```bash
for f in *.md; do
  echo "$f: $(wc -l < "$f") lines"
done
```

---

# HTML + CSS

```html
<div class="card">Hello</div>
```

```css
.card {
  padding: 1rem;
  border-radius: 4px;
  background: linear-gradient(135deg, #6e7bff, #b97bff);
}
```

---

# JSON / YAML

```json
{
  "name": "slides-ng",
  "version": "0.0.1",
  "minAppVersion": "1.4.0"
}
```

```yaml
name: slides-ng
version: 0.0.1
minAppVersion: "1.4.0"
```

---

# Go

```go
package main

import "fmt"

func main() {
  fmt.Println("hello, world")
}
```

---

# Rust

```rust
fn main() {
    let greeting = "hello, world";
    println!("{}", greeting);
}
```

---

# Markdown (highlighting its own syntax)

```md
# Heading

A paragraph with **bold**, *italic*, and [a link](http://example.com).

- Item 1
- Item 2
```

---

# Unknown language (graceful fallback)

```klingon
qaH SoH ghaH'a' ghIH
```

Plaintext, no error.
