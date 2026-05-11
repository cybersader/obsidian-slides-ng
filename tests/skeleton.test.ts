import { test, expect } from "bun:test";

// M1.5 scaffold test — proves `bun test` boots and `bunfig.toml` resolves
// the `tests/` root correctly. M2 replaces this with real parser tests.
test("test runner is wired", () => {
  expect(1 + 1).toBe(2);
});
