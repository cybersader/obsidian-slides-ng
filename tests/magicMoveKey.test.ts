import { test, expect, describe } from "bun:test";
import { parseMagicMoveKey } from "../src/parser/magicMoveKey";

describe("parseMagicMoveKey", () => {
  test("`ts {key=foo}` → { lang: ts, key: foo }", () => {
    expect(parseMagicMoveKey("ts {key=foo}")).toEqual({ lang: "ts", key: "foo" });
  });

  test("`ts [key=mybox]` (square brackets)", () => {
    expect(parseMagicMoveKey("ts [key=mybox]")).toEqual({ lang: "ts", key: "mybox" });
  });

  test("hyphenated key name", () => {
    expect(parseMagicMoveKey("ts {key=auth-flow}")).toEqual({
      lang: "ts",
      key: "auth-flow",
    });
  });

  test("plain lang (no brackets) returns null", () => {
    expect(parseMagicMoveKey("ts")).toBeNull();
    expect(parseMagicMoveKey("typescript")).toBeNull();
  });

  test("bracket present but no `key=` returns null", () => {
    expect(parseMagicMoveKey("ts [1|2-3|all]")).toBeNull();
    expect(parseMagicMoveKey("ts {monaco-diff}")).toBeNull();
  });

  test("key with non-identifier value returns null", () => {
    expect(parseMagicMoveKey("ts {key=}")).toBeNull();
    expect(parseMagicMoveKey("ts {key= }")).toBeNull();
  });

  test("whitespace around key= is tolerated", () => {
    expect(parseMagicMoveKey("ts {key = foo}")?.key).toBe("foo");
  });

  test("empty input returns null", () => {
    expect(parseMagicMoveKey("")).toBeNull();
  });

  test("multiple langs use the first as lang", () => {
    expect(parseMagicMoveKey("ts {key=demo other=stuff}")).toEqual({
      lang: "ts",
      key: "demo",
    });
  });
});
