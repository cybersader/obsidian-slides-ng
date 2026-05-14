---
slides-ng-theme: simple
slides-ng-transition: slide
slides-ng-code-theme: github-light
title: "What async/await actually does"
---

# What `async/await` actually does

A mental model in 15 minutes

<!-- slide: notes="Class of new engineers. Skim sync code review, then dive in." -->

---

## Promises first

A Promise is a *box* that will eventually contain a value.

```js
const box = fetch("/api/users")
// box is NOT the response. It's a Promise.
// It's a thing that, eventually, will give you the response.
```

<!-- slide: notes="Use the box metaphor consistently for the next 10 slides." -->

---

## How do you open the box?

Two ways. Same outcome.

```js
// 1. Chained .then()
fetch("/api/users")
  .then((response) => response.json())
  .then((data) => console.log(data))

// 2. async/await
const response = await fetch("/api/users")
const data = await response.json()
console.log(data)
```

---

## What `await` *actually* does

```js [1-2|4|6|all]
// "Pause this function. Resume when the box opens."
const data = await fetch("/api/users")

// Same as:

const data = fetch("/api/users").then((d) => /* pretend the function resumes here */ d)
```

`await` is **syntactic sugar** for `.then` — nothing more.

<!-- slide: notes="If they take ONE thing from this class, it's this slide." -->

---

## The catch (literally)

What happens if `fetch` rejects?

```js
try {
  const response = await fetch("/api/users")
} catch (err) {
  console.error("network died", err)
}
```

`await` lets you use **try/catch** for async errors. That's a big deal.

---

## Common bug: forgetting `await`

```js
async function getData() {
  const data = fetch("/api/users")    // ← forgot await
  return data.users                    // ← `.users` on a Promise = undefined
}
```

If you ever see `undefined` where you expect a value, suspect a missing `await`.

---

## Common bug: sequential when parallel works

```js
// Slow — runs one after the other
const users = await fetch("/users")
const posts = await fetch("/posts")
// 2× the time

// Fast — both go at once
const [users, posts] = await Promise.all([
  fetch("/users"),
  fetch("/posts"),
])
```

If two calls don't depend on each other, `Promise.all` them.

---

## "Why do I need `async`?"

Because the function can now have `await` inside it.

```js
async function load() {        // ← `async` makes await legal
  const data = await fetch(URL)
  return data
}
```

An `async` function *always* returns a Promise — even if you `return 5` inside it.

---

## Test your understanding

What does this print?

```js
async function go() {
  console.log("A")
  await Promise.resolve()
  console.log("B")
}

console.log("1")
go()
console.log("2")
```

<small>Pause. Try it before flipping.</small>

---

## Answer

```
1
A
2
B
```

`go()` is invoked synchronously. It runs until the `await`, then pauses. The caller continues, prints "2". When the microtask queue runs, "B" follows.

<!-- slide: notes="If anyone got '1, A, B, 2' — that's the most common wrong answer. Walk through the event loop." -->

---

## Reading list

- "Promise chaining" on MDN
- Jake Archibald — *In The Loop* (YouTube)
- The async/await section in Eloquent JavaScript

---

# Questions, or onto the exercises?
