import { test, expect, describe } from "bun:test";
import {
  LAYOUT_SCHEMAS,
  KNOWN_LAYOUTS,
  isKnownLayout,
  schemaFor,
  ALL_KNOWN_SLOTS,
} from "../src/render/layoutSchemas";
import { _dispatchKeys } from "../src/render/layouts";

describe("LAYOUT_SCHEMAS shape", () => {
  test("every entry declares slots + required + description", () => {
    for (const [name, schema] of Object.entries(LAYOUT_SCHEMAS)) {
      expect(schema.slots.length).toBeGreaterThan(0);
      expect(Array.isArray(schema.required)).toBe(true);
      expect(typeof schema.description).toBe("string");
      expect(schema.description.length).toBeGreaterThan(0);
      // required ⊆ slots
      for (const req of schema.required) {
        expect(schema.slots).toContain(req);
      }
      // sanity: name is non-empty
      expect(name.length).toBeGreaterThan(0);
    }
  });

  test("KNOWN_LAYOUTS matches Object.keys(LAYOUT_SCHEMAS)", () => {
    expect([...KNOWN_LAYOUTS].sort()).toEqual(
      Object.keys(LAYOUT_SCHEMAS).sort()
    );
  });

  test("isKnownLayout works as a type guard", () => {
    expect(isKnownLayout("two-cols")).toBe(true);
    expect(isKnownLayout("default")).toBe(true);
    expect(isKnownLayout("nope")).toBe(false);
    expect(isKnownLayout("")).toBe(false);
  });

  test("schemaFor returns the right entry or null", () => {
    expect(schemaFor("cover")?.required).toEqual(["default"]);
    expect(schemaFor("two-cols")?.required).toEqual(["left", "right"]);
    expect(schemaFor("not-real")).toBeNull();
  });

  test("ALL_KNOWN_SLOTS is the union of every layout's slots", () => {
    expect(ALL_KNOWN_SLOTS).toContain("default");
    expect(ALL_KNOWN_SLOTS).toContain("left");
    expect(ALL_KNOWN_SLOTS).toContain("right");
    // Deduplicated.
    expect(new Set(ALL_KNOWN_SLOTS).size).toBe(ALL_KNOWN_SLOTS.length);
  });
});

describe("LAYOUT_SCHEMAS ↔ LAYOUTS dispatch consistency", () => {
  test("every schema entry has a dispatch function", () => {
    const dispatchKeys = _dispatchKeys().sort();
    const schemaKeys = Object.keys(LAYOUT_SCHEMAS).sort();
    expect(dispatchKeys).toEqual(schemaKeys);
  });
});
