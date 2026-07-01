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
 * The `src` attribute of an HTML `<img>` tag: double-quoted (group 2),
 * single-quoted (group 3), or unquoted (group 4). Group 1 is the run of
 * attributes/whitespace between `<img` and `src`, preserved on rewrite.
 *
 * The skip `(?:"[^"]*"|'[^']*'|[^>"'])*?` consumes earlier attributes,
 * treating quoted values as ATOMIC units so a `>` or a literal `src=`
 * inside `alt="a > b"` / `title="use src=x"` can't derail the match.
 * `(?<![-\w])src` anchors on a real `src` attribute, so `data-src` (and
 * any `*-src`) is skipped rather than mistaken for the src to inline.
 */
const IMG_SRC_ATTR_RE =
  /(<img\b(?:"[^"]*"|'[^']*'|[^>"'])*?(?<![-\w])src\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/** URLs an `<img>` can already load in-sandbox — never rewritten. */
const IMG_PASSTHROUGH = /^(https?:|data:)/i;

/**
 * Rewrite the `src` of every raw HTML `<img>` tag via `resolve`, so
 * hand-written `<img src="_attachments/x.png">` (or `./`, `file://`,
 * `app://local/…`) becomes an inlined `data:` URI — the sandboxed
 * null-origin preview iframe can't load any of those raw forms, only
 * `data:`. Remote (`http(s):`) and already-inlined (`data:`) srcs, and
 * any the resolver can't map, are left exactly as authored. Only the
 * `src` value is touched; every other attribute (style, alt, width…) is
 * preserved verbatim.
 *
 * Exported for unit testing; called by `preprocessObsidianImageEmbeds`
 * inside its code-masked region so `<img>` in code fences is untouched.
 */
export function rewriteHtmlImageSrcs(
  text: string,
  resolve?: (path: string) => string | null
): string {
  if (!resolve) return text;
  return text.replace(
    IMG_SRC_ATTR_RE,
    (whole, lead: string, dq?: string, sq?: string, uq?: string): string => {
      const src = dq ?? sq ?? uq ?? "";
      if (!src || IMG_PASSTHROUGH.test(src)) return whole;
      const resolved = resolve(src);
      if (!resolved || resolved === src) return whole;
      // `resolved` is a data: URI (base64 alphabet has no `"`), so a
      // double-quoted attribute is always safe.
      return `${lead}"${resolved}"`;
    }
  );
}

/**
 * A CSS `url(…)` reference: double-quoted (group 1), single-quoted
 * (group 2), or unquoted (group 3), with optional inner whitespace.
 * Matches inside `<style>` blocks AND inline `style="…"` attributes —
 * both pass through marked verbatim, so rewriting here reaches both.
 */
const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*))\s*\)/gi;

/**
 * CSS-bearing regions of the deck: `<style>…</style>` blocks and inline
 * `style="…"` / `style='…'` attributes. The url() rewrite is confined to
 * these so a stray `url(file)` in prose or a non-style attribute isn't
 * touched.
 */
const CSS_CONTEXT_RE =
  /<style\b[^>]*>[\s\S]*?<\/style>|style\s*=\s*"[^"]*"|style\s*=\s*'[^']*'/gi;

/**
 * Emit a CSS `url()` token, quoting ONLY when the value contains a char
 * that would break an unquoted token. A base64 data URI (what the
 * resolver always produces) contains none, so it stays UNQUOTED — which
 * is valid inside a `<style>` block AND, crucially, injects no quote that
 * would prematurely terminate a double- or single-quoted inline
 * `style="…"` attribute. The quoted branches are a defensive fallback for
 * a non-base64 resolver.
 */
function cssUrlToken(value: string): string {
  if (!/[\s()"']/.test(value)) return `url(${value})`;
  if (!value.includes('"')) return `url("${value}")`;
  if (!value.includes("'")) return `url('${value}')`;
  return `url("${value.replace(/"/g, "%22")}")`;
}

/**
 * Rewrite CSS `url(…)` image references (a `background-image` in a
 * `<style>` block, an inline `style="background:url(…)"`, etc.) to
 * inlined `data:` URIs via `resolve`, so styled images load in the
 * sandboxed null-origin preview iframe and the portable file:// export.
 *
 * Remote (`http(s):`) and already-inlined (`data:`) urls, SVG fragment
 * refs (`url(#id)`), and any the resolver can't map are left untouched.
 * An external SVG sprite/view `#fragment` (`url(icons.svg#home)`) is
 * preserved. Output is unquoted for base64 data URIs (see cssUrlToken).
 *
 * Exported for unit testing; called by `preprocessObsidianImageEmbeds`
 * inside its code-masked region so `url(…)` in code samples is untouched.
 */
export function rewriteCssImageUrls(
  text: string,
  resolve?: (path: string) => string | null
): string {
  if (!resolve) return text;
  return text.replace(CSS_CONTEXT_RE, (region: string): string =>
    region.replace(
      CSS_URL_RE,
      (whole, dq?: string, sq?: string, uq?: string): string => {
        const raw = (dq ?? sq ?? uq ?? "").trim();
        if (!raw || IMG_PASSTHROUGH.test(raw)) return whole;
        const resolved = resolve(raw);
        if (!resolved || resolved === raw) return whole;
        // Keep an SVG sprite/view #fragment (data URIs contain no #), so
        // `url(icons.svg#home)` still selects the `home` symbol.
        const frag = /#[^#?]*$/.exec(raw)?.[0] ?? "";
        return cssUrlToken(resolved + frag);
      }
    )
  );
}

/**
 * Fenced code blocks (``` / ~~~) — captured whole so embeds inside them
 * are NOT expanded (Obsidian shows code samples literally).
 */
const FENCED_CODE_RE =
  /(^|\n)[ ]{0,3}([`~]{3,})[^\n]*\n[\s\S]*?\n[ ]{0,3}\2[^\n]*(?=\n|$)/g;
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

  // 2. Rewrite raw HTML <img src="…"> tags the user hand-authored. Done
  // BEFORE embed expansion so it only touches authored <img> tags, never
  // the ones step 3 generates (which would double-resolve their src).
  // Still inside the code mask, so <img> in a code fence stays a literal
  // sample.
  masked = rewriteHtmlImageSrcs(masked, resolve);

  // 2c. Rewrite CSS url(…) image refs in <style> blocks + inline styles,
  // still inside the code mask so url(…) in code samples stays literal.
  masked = rewriteCssImageUrls(masked, resolve);

  // 3. Expand embeds in the remaining (non-code) text.
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

  // 4. Restore masked code regions verbatim.
  return masked.replace(MASK_RE, (_m, i: string) => masks[Number(i)]);
}
