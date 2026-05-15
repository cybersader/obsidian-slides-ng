/**
 * Slides Extended / Slidev-flavoured HTML-comment annotations.
 *
 * Two annotation classes are supported:
 *
 *   Slide annotation:   `<!-- slide attr1="x" attr2 -->`
 *                       Attributes apply to the slide's `<section>` tag
 *                       (e.g. `data-auto-animate`, `class`, `style`).
 *
 *   Element annotation: `<!-- element attr1="x" -->`
 *                       Attributes apply to the immediately-preceding
 *                       rendered element. Used for adding `class`,
 *                       `style`, or `data-*` to a specific paragraph,
 *                       list item, image, etc.
 *
 * Both share the same attribute-parsing grammar (HTML-attribute-ish):
 *
 *   key="quoted value"      → { key: "quoted value" }
 *   key='quoted value'      → { key: "quoted value" }
 *   key=barevalue           → { key: "barevalue" }
 *   key                     → { key: "" }            (bool/data attribute)
 *
 * Slide annotations are extracted from raw markdown content (pre-marked)
 * because we want them gone before markdown→HTML conversion. Element
 * annotations stay as markers in the markdown; a post-process pass
 * (`applyElementAnnotations`) finds them in the rendered HTML and
 * mutates the previous sibling.
 */

export type AttrMap = Record<string, string>;

/*
 * v0.11.47: accept BOTH `<!-- slide attr="..." -->` (canonical, space)
 * AND `<!-- slide: attr="..." -->` (Slides-Extended-style, colon).
 * Many existing decks use the colon form because it reads more like a
 * label. The optional `:?` after the kind keyword + greedy whitespace
 * means we still require at least one space before the attributes,
 * but we tolerate the leading colon.
 */
const SLIDE_ANNOTATION_RE = /<!--\s*slide:?\s+([^-][\s\S]*?)\s*-->/g;
const ELEMENT_ANNOTATION_RE = /<!--\s*element:?\s+([^-][\s\S]*?)\s*-->/g;

/**
 * Parse an attribute string like `class="foo bar" style="color:red" data-auto-animate`
 * into a key/value map. Quoted values preserve internal whitespace; bare keys
 * become empty-string values.
 */
export function parseAttrString(input: string): AttrMap {
  const out: AttrMap = {};
  // Token regex: a key, optionally followed by =value where value is
  // "..."`...`, '...', or a bare \S+ run.
  const tokenRe = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(input)) !== null) {
    const key = m[1];
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    out[key] = value;
  }
  return out;
}

/**
 * Strip all `<!-- slide ... -->` markers from a slide's raw markdown
 * content. Returns the cleaned markdown and the merged attribute map
 * (multiple slide annotations on the same slide are merged left-to-right;
 * later wins for the same key).
 */
export function extractSlideAttrs(content: string): {
  content: string;
  attrs: AttrMap;
} {
  const attrs: AttrMap = {};
  const stripped = content.replace(SLIDE_ANNOTATION_RE, (_match, body: string) => {
    Object.assign(attrs, parseAttrString(body));
    return "";
  });
  // Collapse any blank-line runs left by stripping markers.
  const cleaned = stripped.replace(/\n{3,}/g, "\n\n").trim();
  return { content: cleaned, attrs };
}

/**
 * Find `<!-- element ATTRS -->` markers in already-rendered HTML and
 * fold their attributes into the immediately-preceding element.
 *
 * Strategy: regex over the rendered HTML, looking for `<TAG ATTRS>...</TAG>`
 * immediately followed by a `<!-- element ... -->` marker. The marker is
 * removed and its attrs are merged into the opening tag.
 *
 * Limitations:
 *   - Won't handle self-closing tags like `<img>` followed by a marker
 *     (we add support by also matching `<TAG ATTRS />` and `<img ... >`).
 *   - Won't handle markers across newlines from the element it modifies
 *     only via simple whitespace.
 *
 * For paragraph-level annotations these limits are fine — marked emits
 * `<p>...</p>\n<!-- element ... -->\n` reliably.
 */
export function applyElementAnnotations(html: string): string {
  let out = html;
  // Apply repeatedly so adjacent markers (uncommon but possible) all get
  // attributed correctly.
  let iterations = 0;
  let changed = true;
  while (changed && iterations < 50) {
    changed = false;
    iterations++;
    out = out.replace(
      /(<\/[a-zA-Z][\w-]*>|<(?:img|br|hr|input)\b[^>]*\/?>)\s*<!--\s*element\s+([^-][\s\S]*?)\s*-->/g,
      (_match, prevClose: string, attrBody: string) => {
        changed = true;
        const attrs = parseAttrString(attrBody);
        // Find the matching open tag for prevClose: scan backward in `out`
        // up to this position. This is awkward for regex.replace — we
        // need to do the rewrite imperatively for that. So return a
        // sentinel and patch up in a second pass below.
        const sentinel = `__SLIDES_NG_ELEMENT_ANNOTATION__${JSON.stringify(attrs)}__END__`;
        return prevClose + sentinel;
      }
    );
    if (changed) out = collapseElementSentinels(out);
  }
  return out;
}

function collapseElementSentinels(html: string): string {
  // For each sentinel, find the matching open tag of the immediately-
  // preceding closed element and merge attributes into it.
  return html.replace(
    /(<([a-zA-Z][\w-]*)([^>]*)>(?:[\s\S]*?)<\/\2>)\s*__SLIDES_NG_ELEMENT_ANNOTATION__(\{[\s\S]*?\})__END__/g,
    (_match, elementHtml: string, tag: string, existingAttrs: string, attrsJson: string) => {
      const attrs = JSON.parse(attrsJson) as AttrMap;
      const updatedOpen = mergeOpenTag(`<${tag}${existingAttrs}>`, attrs);
      // Replace the original opening tag in elementHtml with the updated one.
      const updatedElement = elementHtml.replace(
        `<${tag}${existingAttrs}>`,
        updatedOpen
      );
      return updatedElement;
    }
  );
}

/**
 * Merge attributes into an HTML opening tag. `class` and `style` values
 * are concatenated; everything else is overwritten by the new value.
 */
export function mergeOpenTag(openTag: string, newAttrs: AttrMap): string {
  // Parse the existing attrs out of openTag.
  const m = /^<([a-zA-Z][\w-]*)([^>]*)>$/.exec(openTag);
  if (!m) return openTag;
  const tagName = m[1];
  const existing = parseAttrString(m[2]);

  const merged: AttrMap = { ...existing };
  for (const [k, v] of Object.entries(newAttrs)) {
    if ((k === "class" || k === "style") && existing[k]) {
      // Concatenate; for class, space-separated; for style, ensure
      // semicolon between rules.
      if (k === "class") {
        merged[k] = `${existing[k]} ${v}`.trim();
      } else {
        const left = existing[k].trim().replace(/;\s*$/, "");
        merged[k] = `${left}; ${v}`;
      }
    } else {
      merged[k] = v;
    }
  }

  // Render back, preserving attribute order: existing first, then any
  // new keys that weren't in existing.
  const order = [
    ...Object.keys(existing),
    ...Object.keys(newAttrs).filter((k) => !(k in existing)),
  ];
  const parts: string[] = [tagName];
  for (const k of order) {
    if (!(k in merged)) continue;
    const v = merged[k];
    parts.push(v === "" ? k : `${k}="${escapeAttrVal(v)}"`);
  }
  return `<${parts.join(" ")}>`;
}

function escapeAttrVal(v: string): string {
  return v.replace(/"/g, "&quot;");
}

/**
 * Render an attribute map as an HTML-attribute string (no surrounding
 * angle brackets, no leading space). Used by the section-tag emitter.
 */
export function renderAttrs(attrs: AttrMap): string {
  return Object.entries(attrs)
    .map(([k, v]) => (v === "" ? k : `${k}="${escapeAttrVal(v)}"`))
    .join(" ");
}
