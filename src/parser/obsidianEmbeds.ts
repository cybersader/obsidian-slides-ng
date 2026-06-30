/**
 * v0.13.3: Obsidian image-embed support.
 *
 * Obsidian's `![[image.png]]` wikilink-embed syntax is NOT standard
 * markdown — `marked` passes it straight through as literal text. So
 * decks authored with the Obsidian "embed an attachment" workflow had
 * their images render as the raw `![[...]]` string. This module
 * preprocesses those embeds into resolved `<img>` HTML before marked
 * runs.
 *
 * Supported Obsidian embed forms (the `|...` suffix is optional):
 *   ![[image.png]]                 → <img src="…">
 *   ![[image.png|300]]             → width 300
 *   ![[image.png|300x200]]         → width 300, height 200
 *   ![[image.png|caption text]]    → alt="caption text" (non-numeric ⇒ alt)
 *   ![[folder/sub/image.png]]      → resolver locates by basename/path
 *   ![[image.png#anything]]        → '#…' subpath stripped (no headings in images)
 *
 * Only recognised IMAGE extensions are transformed. Non-image embeds
 * (`![[note]]`, `![[doc.pdf]]`, audio/video) are left untouched so we
 * don't mangle content this module doesn't yet handle.
 *
 * The matching standard-markdown image path (`![](relative.png)`) is
 * handled by the `image()` renderer override in renderDeck.ts using the
 * same `resolveImage` callback + the same `buildImgTag` helper here, so
 * both syntaxes resolve identically.
 */

/**
 * Image file extensions Obsidian renders as an `<img>` embed. Mirrors
 * Obsidian's accepted set exactly (avif, bmp, gif, jpeg, jpg, png, svg,
 * webp) — `ico`/`apng` are intentionally excluded because Obsidian does
 * NOT treat them as embeddable images.
 */
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i;

/** Matches a single `![[ … ]]` embed (inner can't contain brackets). */
const EMBED_RE = /!\[\[([^[\]]+?)\]\]/g;

export interface ParsedEmbed {
  /** The link target with any `#subpath` and `|suffix` removed. */
  linkpath: string;
  /** Alt text, when the `|suffix` was non-numeric. */
  alt: string;
  /** Pixel width, when the `|suffix` encoded a size. */
  width?: number;
  /** Pixel height, when the `|suffix` was `WxH`. */
  height?: number;
}

/**
 * Parse the inner text of an `![[ inner ]]` embed.
 * Returns null when the link target is not an image (so the caller
 * leaves the embed untouched).
 */
export function parseEmbedInner(inner: string): ParsedEmbed | null {
  // Split off the Obsidian display/size suffix: `path|suffix`.
  const pipeIdx = inner.indexOf("|");
  const rawPath = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).trim();
  const suffix = pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : "";

  // Strip a `#subpath` (block/heading ref) — meaningless for images.
  const linkpath = rawPath.replace(/#.*$/, "").trim();
  if (!linkpath || !IMAGE_EXT.test(linkpath)) return null;

  const result: ParsedEmbed = { linkpath, alt: "" };
  if (suffix) {
    const size = /^(\d+)(?:x(\d+))?$/.exec(suffix);
    if (size) {
      result.width = parseInt(size[1], 10);
      if (size[2]) result.height = parseInt(size[2], 10);
    } else {
      result.alt = suffix;
    }
  }
  return result;
}

/** HTML-escape a value destined for a double-quoted attribute. */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface ImgTagOptions {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  /** Extra class names appended after `slides-ng-embed`. */
  className?: string;
}

/**
 * Build an `<img>` tag string from resolved attributes. Shared by the
 * embed preprocessor and the markdown `image()` renderer so the two
 * image syntaxes emit identical markup.
 */
export function buildImgTag(opts: ImgTagOptions): string {
  const cls = opts.className
    ? `slides-ng-embed ${opts.className}`
    : "slides-ng-embed";
  let tag = `<img class="${escapeAttr(cls)}" src="${escapeAttr(opts.src)}" alt="${escapeAttr(opts.alt ?? "")}"`;
  if (typeof opts.width === "number") tag += ` width="${opts.width}"`;
  if (typeof opts.height === "number") tag += ` height="${opts.height}"`;
  tag += ">";
  return tag;
}

/**
 * Fenced code blocks (``` / ~~~) — captured whole so embeds inside them
 * are NOT expanded (Obsidian shows code samples literally).
 */
const FENCED_CODE_RE = /(^|\n)([`~]{3,})[^\n]*\n[\s\S]*?\n\2[^\n]*(?=\n|$)/g;
/** Inline code spans (`` `…` ``) on a single line. */
const INLINE_CODE_RE = /(`+)[^\n]*?\1/g;
/** Placeholder for masked code regions (collision-safe vs real content). */
const MASK_RE = /@@MASK(\d+)@@/g;

/**
 * Replace every `![[image.*]]` embed in `markdown` with resolved
 * `<img>` HTML. `resolve` maps a link target to a loadable URL
 * (`app://…` for in-Obsidian preview, a `data:` URI for standalone
 * export) or returns null/undefined when it can't resolve — in which
 * case the raw link target is used as the `src` (best effort, and it
 * still renders as a real `<img>` rather than literal `![[…]]` text).
 *
 * Embeds inside fenced or inline code are left untouched (matching
 * Obsidian, which renders those as literal text). Non-image embeds are
 * also returned unchanged.
 */
export function preprocessObsidianImageEmbeds(
  markdown: string,
  resolve?: (linkpath: string) => string | null
): string {
  // 1. Mask code regions so embeds inside them survive verbatim.
  const masks: string[] = [];
  const mask = (s: string): string => {
    masks.push(s);
    return `@@MASK${masks.length - 1}@@`;
  };
  let masked = markdown
    .replace(FENCED_CODE_RE, (m) => mask(m))
    .replace(INLINE_CODE_RE, (m) => mask(m));

  // 2. Expand embeds in the remaining (non-code) text.
  masked = masked.replace(EMBED_RE, (whole, inner: string) => {
    const parsed = parseEmbedInner(inner);
    if (!parsed) return whole; // not an image embed — leave as-is
    const resolved = resolve ? resolve(parsed.linkpath) : null;
    const src = resolved ?? parsed.linkpath;
    return buildImgTag({
      src,
      alt: parsed.alt,
      width: parsed.width,
      height: parsed.height,
    });
  });

  // 3. Restore masked code regions verbatim.
  return masked.replace(MASK_RE, (_m, i: string) => masks[Number(i)]);
}
