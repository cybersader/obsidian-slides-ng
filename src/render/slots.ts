/**
 * Slidev-style slot splitter.
 *
 * Slide content can be partitioned into named slots using `::name::`
 * markers on their own line. Each layout template receives a slot map
 * and decides where each piece of content goes (left column, right
 * column, header, etc.). Content before the first marker is the
 * `default` slot.
 *
 *   # A two-column slide
 *
 *   This intro goes in the default slot.
 *
 *   ::left::
 *
 *   Left column markdown.
 *
 *   ::right::
 *
 *   Right column markdown.
 *
 * Slot names match `/^::([a-zA-Z][\w-]*)::\s*$/` — letters, digits,
 * underscores, hyphens. Whitespace-only lines aren't markers.
 */

const SLOT_RE = /^::([a-zA-Z][\w-]*)::\s*$/;

export type SlotMap = Record<string, string>;

/** Split a slide's markdown body into named slots. */
export function splitSlots(content: string): SlotMap {
  const out: SlotMap = { default: "" };
  let current = "default";
  const buffers: Record<string, string[]> = { default: [] };

  const lines = content.split("\n");
  for (const line of lines) {
    const match = SLOT_RE.exec(line);
    if (match) {
      const name = match[1];
      current = name;
      if (!buffers[name]) buffers[name] = [];
      continue;
    }
    buffers[current].push(line);
  }

  for (const [name, lines] of Object.entries(buffers)) {
    out[name] = lines.join("\n").trim();
  }

  return out;
}

/** Does this content contain any slot markers? */
export function hasSlots(content: string): boolean {
  for (const line of content.split("\n")) {
    if (SLOT_RE.test(line)) return true;
  }
  return false;
}
