/**
 * v0.12.2: experimental "smart wrap" — header-structure-aware
 * distribution of a selected text into a multi-slot snippet.
 *
 * Two-deep model:
 *   - H1 of the selection → maps to the snippet\'s OUTER scope (often
 *     the title at top of the snippet, where the cursor-marker `█`
 *     lives in the cursor-marker convention).
 *   - Each H2 of the selection → maps to ONE child slot in the
 *     snippet. Child slots are detected by counting `::::` opens at
 *     the same indentation depth inside the snippet body.
 *
 * If the slot count doesn\'t match (more H2s than slots, fewer H2s
 * than slots, no H2s at all), we fall back to the basic wrap
 * behaviour (selection at the cursor marker) so the user never gets
 * a worse result than the non-smart path.
 *
 * Pure functions here — no Obsidian editor coupling — so we can
 * unit-test the wrap logic directly.
 */

export interface SmartWrapResult {
  /** The final text to replace the selection with. */
  text: string;
  /** Where to put the caret after replacement, as char offset within `text`. */
  cursorOffset: number;
  /** True if smart distribution actually fired; false → fell back to simple wrap. */
  applied: boolean;
}

/**
 * Split a selection into { title, sections } where title is the H1
 * content (if any) and sections is the H2-delimited body chunks.
 *
 * "Two-deep" — H1 and H2 only. H3+ stays inside the section it sits in.
 */
export function parseSelection(selection: string): {
  title: string | null;
  sections: { heading: string; body: string }[];
  preH2Lead: string;
} {
  const lines = selection.split("\n");
  let title: string | null = null;
  const sections: { heading: string; body: string }[] = [];
  const preH2Lines: string[] = [];
  let currentHeading: string | null = null;
  let currentBody: string[] = [];

  for (const line of lines) {
    const h1 = /^# +(.*)$/.exec(line);
    const h2 = /^## +(.*)$/.exec(line);
    if (h1 && title === null) {
      title = h1[1].trim();
      continue;
    }
    if (h2) {
      // flush previous section
      if (currentHeading !== null) {
        sections.push({
          heading: currentHeading,
          body: currentBody.join("\n").trim(),
        });
      }
      currentHeading = h2[1].trim();
      currentBody = [];
      continue;
    }
    if (currentHeading !== null) {
      currentBody.push(line);
    } else {
      preH2Lines.push(line);
    }
  }
  if (currentHeading !== null) {
    sections.push({
      heading: currentHeading,
      body: currentBody.join("\n").trim(),
    });
  }
  return {
    title,
    sections,
    preH2Lead: preH2Lines.join("\n").trim(),
  };
}

/**
 * Count distinct child slots in a snippet body. A child slot is an
 * inner `::::` fenced block (different colon count than the outer
 * `:::` opener). We don\'t need to actually parse — just count
 * `^::::[ \t]\S` opening lines.
 */
export function countChildSlots(snippetText: string): number {
  let count = 0;
  for (const line of snippetText.split("\n")) {
    if (/^::::[ \t]+\S/.test(line)) count++;
  }
  return count;
}

/**
 * For each child-slot opening `^::::[ \t]\S` line in the snippet,
 * find the matching `^::::[ \t]*$` close line. Return slot body
 * regions as [openLineIdx, closeLineIdx] tuples (0-based).
 */
export function findChildSlots(snippetText: string): Array<{ openIdx: number; closeIdx: number }> {
  const lines = snippetText.split("\n");
  const slots: Array<{ openIdx: number; closeIdx: number }> = [];
  let openStack: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^::::[ \t]+\S/.test(line)) {
      openStack.push(i);
    } else if (/^::::[ \t]*$/.test(line) && openStack.length > 0) {
      const openIdx = openStack.pop()!;
      slots.push({ openIdx, closeIdx: i });
    }
  }
  // sort by openIdx ascending so slot order matches snippet order
  slots.sort((a, b) => a.openIdx - b.openIdx);
  return slots;
}

/**
 * Replace each slot's body lines (the lines between its `::::`
 * open and `::::` close, excluding the fence lines themselves)
 * with the provided body chunk. If `sections.length` < slot count,
 * leftover slots keep their original body.
 */
export function fillSlots(
  snippetText: string,
  sections: { heading: string; body: string }[]
): string {
  const lines = snippetText.split("\n");
  const slots = findChildSlots(snippetText);
  // Apply in REVERSE so earlier offsets don\'t shift while we splice.
  for (let i = Math.min(slots.length, sections.length) - 1; i >= 0; i--) {
    const slot = slots[i];
    const section = sections[i];
    // Replace the open line\'s tail (after ::::) with " { }" to make
    // the slot bare; the user\'s heading and body get inserted as
    // the slot body. Keep the open line\'s ":::: " prefix.
    const openLine = lines[slot.openIdx].match(/^(::::[ \t]+)/);
    const openPrefix = openLine ? openLine[1] : ":::: ";
    lines[slot.openIdx] = `${openPrefix}{ }`;
    // Build the new body content: empty line, then content, then empty line.
    const headerLine = section.heading ? `## ${section.heading}` : "";
    const bodyChunks = [headerLine, "", section.body].filter((s, idx) => s.length > 0 || idx === 1);
    const newBody = ["", ...bodyChunks, ""];
    lines.splice(slot.openIdx + 1, slot.closeIdx - slot.openIdx - 1, ...newBody);
  }
  return lines.join("\n");
}

/**
 * Top-level: try smart wrap, fall back to simple wrap if structure
 * doesn\'t match.
 */
export function smartWrap(
  snippetText: string,
  cursorOffset: number,
  selection: string
): SmartWrapResult {
  const slotCount = countChildSlots(snippetText);
  const parsed = parseSelection(selection);

  // Smart path requires: snippet has 2+ slots AND selection has
  // matching number of H2 sections.
  if (slotCount >= 2 && parsed.sections.length === slotCount) {
    // Fill slots first (slot positions are line-based — independent
    // of any prelude).
    const filled = fillSlots(snippetText, parsed.sections);
    // Preserve the H1 (if any) by prepending it ABOVE the snippet.
    // Cleaner than trying to merge it inside — the H1 typically maps
    // to the slide\'s overall heading which lives outside any
    // particular layout block.
    if (parsed.title) {
      const prefix = `# ${parsed.title}\n\n`;
      return {
        text: prefix + filled,
        cursorOffset: 2, // caret right after "# "
        applied: true,
      };
    }
    return { text: filled, cursorOffset: filled.length, applied: true };
  }

  // Fallback — basic wrap (selection at cursor marker).
  const fallback =
    snippetText.slice(0, cursorOffset) + selection + snippetText.slice(cursorOffset);
  return {
    text: fallback,
    cursorOffset: cursorOffset + selection.length,
    applied: false,
  };
}
