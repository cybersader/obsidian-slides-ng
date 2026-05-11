/**
 * Layout metadata registry. Single source of truth for:
 *   • which layouts exist (drives the dispatch table in `layouts.ts`)
 *   • which slots each layout consumes (drives the autocomplete suggester
 *     and the render-time validation in `applyLayout`)
 *   • one-line descriptions (shown as sublabels in the layout-name
 *     autocomplete dropdown)
 *
 * Adding a new layout:
 *   1. Add an entry here describing its slots + required slots + description.
 *   2. Add the matching `LayoutFn` to `LAYOUTS` in `src/render/layouts.ts`.
 *   3. Add the matching CSS class block to `src/render/revealTemplate.ts`.
 *
 * The unit test `tests/layoutSchemas.test.ts` verifies (1) and (2) stay in
 * sync; the renderer's `applyLayout` enforces (1) at runtime via console
 * warnings when required slots are missing.
 */

export interface LayoutSchema {
  /** All slots this layout may consume — fed to the slot-marker autocomplete. */
  readonly slots: readonly string[];
  /** Slots that must be non-empty; missing → console.warn at render time. */
  readonly required: readonly string[];
  /** One-line description — shown as the dropdown sublabel. */
  readonly description: string;
}

export const LAYOUT_SCHEMAS = {
  default: {
    slots: ["default"],
    required: ["default"],
    description: "Single column (the v0.1 baseline)",
  },
  center: {
    slots: ["default"],
    required: ["default"],
    description: "Content vertically and horizontally centered",
  },
  cover: {
    slots: ["default"],
    required: ["default"],
    description: "Title-slide style, larger type",
  },
  "two-cols": {
    slots: ["left", "right"],
    required: ["left", "right"],
    description: "Left and right columns",
  },
  "two-cols-header": {
    slots: ["default", "left", "right"],
    required: ["left", "right"],
    description: "Header on top, two columns below",
  },
  quote: {
    slots: ["default"],
    required: ["default"],
    description: "Large blockquote styling",
  },
  statement: {
    slots: ["default"],
    required: ["default"],
    description: "Single emphasised statement",
  },
  section: {
    slots: ["default"],
    required: ["default"],
    description: "Chapter-divider style",
  },
  end: {
    slots: ["default"],
    required: ["default"],
    description: "Closing slide",
  },
} as const satisfies Record<string, LayoutSchema>;

export type LayoutName = keyof typeof LAYOUT_SCHEMAS;

/** All registered layout names — derived from the schemas. */
export const KNOWN_LAYOUTS: readonly LayoutName[] = Object.keys(
  LAYOUT_SCHEMAS
) as LayoutName[];

export function isKnownLayout(name: string): name is LayoutName {
  return Object.prototype.hasOwnProperty.call(LAYOUT_SCHEMAS, name);
}

/** Schema lookup; returns null for unknown layout names. */
export function schemaFor(name: string): LayoutSchema | null {
  return isKnownLayout(name) ? LAYOUT_SCHEMAS[name] : null;
}

/**
 * Union of every slot name any layout may consume. Useful as the fallback
 * suggestion list when the slot-marker autocomplete can't determine the
 * current slide's layout.
 */
export const ALL_KNOWN_SLOTS: readonly string[] = Array.from(
  new Set(Object.values(LAYOUT_SCHEMAS).flatMap((s) => s.slots))
).sort();
