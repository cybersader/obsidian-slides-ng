---
slides-ng: true
slides-ng-theme: dracula
slides-ng-transition: fade
slides-ng-code-theme: dracula
title: "TypeScript Generics: From Curious to Confident"
---

# TypeScript Generics

From curious to confident

<!-- slide: notes="3-hour workshop. Pace yourself — there's a lot here." -->

---

## How this works

- Code-along, not lecture
- Pause anytime; we'll catch up
- Two coffee breaks (built in)
- Solutions in the repo

---

## Mental model: generics ARE parameters

```ts
// You already accept these:
function add(a: number, b: number) { return a + b }

// Generics let you accept these too:
function first<T>(xs: T[]): T | undefined { return xs[0] }
```

The `<T>` is a parameter — for *types*.

---

## Why bother?

Without generics, you'd have to write:

```ts
function firstString(xs: string[]): string | undefined { return xs[0] }
function firstNumber(xs: number[]): number | undefined { return xs[0] }
function firstUser(xs: User[]): User | undefined { return xs[0] }
// ... ad nauseam
```

Or accept `any` and lose all safety.

---

## Constraint syntax: `extends`

```ts [1|2-4|5-7|all]
// Plain generic — accepts anything
function id<T>(x: T): T { return x }
// Constrained generic — only "things with .length"
function lengthOf<T extends { length: number }>(x: T): number {
  return x.length
}
lengthOf("hello")    // 5
lengthOf([1, 2, 3])  // 3
lengthOf(42)         // ❌ Error
```

<!-- slide: notes="Spend time here — `extends` confuses everyone the first time. Stress that this is a CONSTRAINT, not inheritance." -->

---

## Exercise 1

Write `pickFirst<T>` that takes an array AND a key, and returns the value at that key on the first element.

```ts
type User = { id: string, name: string }
const users: User[] = [{ id: "1", name: "Ada" }]

pickFirst(users, "name") // should return "Ada"
pickFirst(users, "id")   // should return "1"
pickFirst(users, "age")  // should ERROR at compile time
```

15 minutes. Hint: `keyof`.

---

## Solution

```ts
function pickFirst<T, K extends keyof T>(
  xs: T[],
  key: K
): T[K] | undefined {
  return xs[0]?.[key]
}
```

The magic: `K extends keyof T` ties the key to the element type.

---

## Pattern: returning a different type

```ts [1-3|5-9|all]
function pair<A, B>(a: A, b: B): [A, B] {
  return [a, b]
}

const result = pair("hello", 42)
//      ^? readonly [string, number]

const [s, n] = pair("hello", 42)
// s: string, n: number
```

Multiple type parameters work just like multiple value parameters.

---

## Coffee break — 15 min

We'll cover *conditional types* and *mapped types* after.

<!-- slide: notes="If running long, drop the mapped-types section." -->

---

## Conditional types

```ts
type IsString<T> = T extends string ? true : false

type A = IsString<"hello">  // true
type B = IsString<42>       // false
```

Reads like a ternary, evaluates at compile time.

---

## Mapped types

```ts
type Readonly<T> = {
  readonly [K in keyof T]: T[K]
}

type User = { id: string, name: string }
type ReadonlyUser = Readonly<User>
// { readonly id: string, readonly name: string }
```

This is how `Readonly`, `Partial`, `Pick` are built.

---

## When to reach for generics

- Same logic, different types → ✓
- One specific type → don't
- You're writing a library → almost always
- You're writing an app → less often than you think

---

## Resources

- TypeScript Deep Dive (free, online)
- Matt Pocock's `type-level-typescript`
- The TS playground — paste and tweak

Slack `#typescript-questions` for follow-up.
