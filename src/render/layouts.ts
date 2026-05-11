/**
 * Slidev-flavoured layout templates.
 *
 * Each layout takes a slot map (slot name → already-converted HTML) and
 * returns the slide body HTML wrapped in layout-specific markup. The
 * paired CSS lives in `revealTemplate.ts`'s iframe `<style>` block;
 * each layout's wrapper has a `data-layout="<name>"` attribute that the
 * CSS targets.
 *
 * Layouts implemented for v0.2 (initial slice):
 *
 *   default         — single column, no transformation
 *   center          — content vertically + horizontally centered
 *   cover           — title-slide style, large type, centered
 *   two-cols        — left + right side-by-side
 *   two-cols-header — header on top, two columns below
 *   quote           — large blockquote styling
 *   statement       — single emphasised statement
 *   section         — chapter-divider style
 *   end             — closing slide ("fin" / "the end")
 *
 * Image-* layouts and iframe-* layouts are intentionally NOT in this
 * cut — image layouts need Obsidian attachment-path resolution; iframe
 * layouts conflict with our sandbox.
 */

export type RenderedSlots = Record<string, string>;

export type LayoutFn = (slots: RenderedSlots) => string;

export const KNOWN_LAYOUTS = [
  "default",
  "center",
  "cover",
  "two-cols",
  "two-cols-header",
  "quote",
  "statement",
  "section",
  "end",
] as const;

export type LayoutName = (typeof KNOWN_LAYOUTS)[number];

export function isKnownLayout(name: string): name is LayoutName {
  return (KNOWN_LAYOUTS as readonly string[]).includes(name);
}

export function applyLayout(name: string, slots: RenderedSlots): string {
  const fn: LayoutFn = isKnownLayout(name)
    ? LAYOUTS[name as LayoutName]
    : LAYOUTS.default;
  return wrap(name, fn(slots));
}

function wrap(name: string, inner: string): string {
  return `<div class="slides-ng-layout" data-layout="${name}">${inner}</div>`;
}

// ---------------------------------------------------------------------------
// Individual layout templates
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
