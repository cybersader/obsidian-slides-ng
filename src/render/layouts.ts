/**
 * Slidev-flavoured layout templates.
 *
 * Each layout takes a slot map (slot name → already-converted HTML) and
 * returns the slide body HTML wrapped in layout-specific markup. The
 * paired CSS lives in `revealTemplate.ts`'s iframe `<style>` block;
 * each layout's wrapper has a `data-layout="<name>"` attribute that the
 * CSS targets.
 *
 * The list of supported layouts + each layout's slot expectations lives in
 * `layoutSchemas.ts` (the single source of truth). The dispatch table
 * `LAYOUTS` below maps each schema entry to a render function. A unit
 * test enforces that the two stay in sync.
 *
 * `applyLayout` also warns (via console.warn) when a layout's required
 * slots are missing — graceful degradation, but the user sees a hint in
 * Obsidian's dev console when something's silently wrong.
 */

import {
  LAYOUT_SCHEMAS,
  KNOWN_LAYOUTS,
  isKnownLayout,
  schemaFor,
  type LayoutName,
} from "./layoutSchemas";

export { LAYOUT_SCHEMAS, KNOWN_LAYOUTS, isKnownLayout, type LayoutName };

export type RenderedSlots = Record<string, string>;

export type LayoutFn = (slots: RenderedSlots) => string;

export function applyLayout(name: string, slots: RenderedSlots): string {
  const schema = schemaFor(name);
  if (schema) {
    validateSlots(name, schema.required, slots);
  }
  const fn: LayoutFn = isKnownLayout(name) ? LAYOUTS[name] : LAYOUTS.default;
  return wrap(name, fn(slots));
}

function validateSlots(
  layoutName: string,
  required: readonly string[],
  slots: RenderedSlots
): void {
  const missing = required.filter((slot) => {
    const value = slots[slot];
    return value === undefined || value === null || value.trim().length === 0;
  });
  if (missing.length > 0) {
    console.warn(
      `[slides-ng] layout "${layoutName}" expects required slot(s) [${missing
        .map((s) => `::${s}::`)
        .join(", ")}] but the slide didn't define them. Rendering will proceed with empty placeholders.`
    );
  }
}

function wrap(name: string, inner: string): string {
  return `<div class="slides-ng-layout" data-layout="${name}">${inner}</div>`;
}

// ---------------------------------------------------------------------------
// Dispatch table — must mirror LAYOUT_SCHEMAS. The consistency test in
// tests/layoutSchemas.test.ts enforces this.
// ---------------------------------------------------------------------------

const LAYOUTS: Record<LayoutName, LayoutFn> = {
  default: (s) => s.default ?? "",

  center: (s) =>
    `<div class="slides-ng-center">${s.default ?? ""}</div>`,

  cover: (s) =>
    `<div class="slides-ng-cover">${s.default ?? ""}</div>`,

  "two-cols": (s) =>
    `<div class="slides-ng-cols-2">` +
    `<div class="slides-ng-col slides-ng-col-left">${s.left ?? ""}</div>` +
    `<div class="slides-ng-col slides-ng-col-right">${s.right ?? ""}</div>` +
    `</div>`,

  "two-cols-header": (s) =>
    `<div class="slides-ng-cols-2-header">` +
    `<div class="slides-ng-header">${s.default ?? ""}</div>` +
    `<div class="slides-ng-cols-wrap">` +
    `<div class="slides-ng-col slides-ng-col-left">${s.left ?? ""}</div>` +
    `<div class="slides-ng-col slides-ng-col-right">${s.right ?? ""}</div>` +
    `</div>` +
    `</div>`,

  quote: (s) =>
    `<div class="slides-ng-quote">${s.default ?? ""}</div>`,

  statement: (s) =>
    `<div class="slides-ng-statement">${s.default ?? ""}</div>`,

  section: (s) =>
    `<div class="slides-ng-section">${s.default ?? ""}</div>`,

  end: (s) =>
    `<div class="slides-ng-end">${s.default ?? ""}</div>`,
};

/** Test-only: expose the dispatch keys for the consistency check. */
export function _dispatchKeys(): string[] {
  return Object.keys(LAYOUTS);
}
