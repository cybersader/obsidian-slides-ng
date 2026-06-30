/**
 * v0.13.3: standalone-export image embedding.
 *
 * In-Obsidian preview resolves attachment paths to `app://…` URLs,
 * which only load inside Obsidian. A standalone export opened in an
 * external browser (or printed to PDF) can't fetch `app://`, so every
 * referenced image is inlined as a `data:` URI. This makes the
 * exported `.html` fully self-contained and portable.
 *
 * The flow:
 *   1. Scan the deck markdown for image references — both Obsidian
 *      `![[image.png]]` embeds and standard `![](relative.png)` images.
 *   2. Resolve each to a vault TFile, read its bytes, base64-encode,
 *      build `data:<mime>;base64,…`.
 *   3. Return a SYNC resolver (path → data-URI | null) suitable for
 *      `RenderDefaults.resolveImage`, which the renderer calls during
 *      the (synchronous) render pass.
 *
 * Pure helpers (collectImageTargets / arrayBufferToBase64 /
 * mimeForExtension) are exported for unit testing without an Obsidian
 * app instance.
 */

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i;

/** Already-loadable URLs that need no embedding. */
const PASSTHROUGH = /^(https?:|data:|file:)/i;

/** Strip Obsidian wikilink wrapping (`![[ ]]` / `[[ ]]`) + whitespace. */
export function stripWikiBrackets(s: string): string {
  return s.replace(/^!?\[\[/, "").replace(/\]\]$/, "").trim();
}

/**
 * Extract the set of vault-relative media link targets referenced by
 * the deck markdown — Obsidian `![[…]]` embeds, standard `![](…)`
 * images, AND the `image:` / `slides-ng-image:` frontmatter +
 * `data-background-image` / `data-background-video` slide attributes
 * (all of which the renderer resolves through the same callback).
 *
 * Targets are normalised: `|size` / `#subpath` / wikilink brackets
 * stripped. Markdown-image hrefs are kept exactly as authored (only
 * `<>` delimiters removed) because marked passes `token.href`
 * un-decoded to the renderer, so the resolver map must key-match that.
 * Absolute/remote URLs are excluded (they need no embedding).
 */
export function collectImageTargets(markdown: string): string[] {
  const out = new Set<string>();
  const addIfLocal = (raw: string): void => {
    const t = stripWikiBrackets(raw);
    if (t && !PASSTHROUGH.test(t)) out.add(t);
  };

  // Obsidian embeds: ![[ target|suffix ]] — image extensions only.
  for (const m of markdown.matchAll(/!\[\[([^[\]]+?)\]\]/g)) {
    const target = m[1].split("|")[0].replace(/#.*$/, "").trim();
    if (target && IMAGE_EXT.test(target)) addIfLocal(target);
  }

  // Standard markdown images: ![alt](href "title") or ![alt](<href>).
  // Angle-bracket form may contain spaces, so match it separately.
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(\s*<([^>]+)>/g)) {
    addIfLocal(m[1].trim());
  }
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(\s*([^<)\s]+)/g)) {
    addIfLocal(m[1].trim());
  }

  // Frontmatter / per-slide YAML: `image:` or `slides-ng-image:`.
  for (const m of markdown.matchAll(
    /^[ \t]*(?:slides-ng-)?image:[ \t]*["']?(.+?)["']?[ \t]*$/gim
  )) {
    addIfLocal(m[1]);
  }

  // Slide-attribute backgrounds: data-background-image / -video.
  for (const m of markdown.matchAll(
    /data-background-(?:image|video)\s*[:=]\s*["']?([^"'\s>]+)/gi
  )) {
    addIfLocal(m[1]);
  }

  return Array.from(out);
}

/** decodeURI that never throws on malformed input. */
function safeDecode(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/** Map a file extension to an image MIME type. */
export function mimeForExtension(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  const ext = (m ? m[1] : "").toLowerCase();
  switch (ext) {
    case "png":
    case "apng":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "bmp":
      return "image/bmp";
    case "ico":
      return "image/x-icon";
    // Video — supported for `data-background-video` backgrounds.
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "ogv":
      return "video/ogg";
    default:
      return "application/octet-stream";
  }
}

/**
 * Base64-encode an ArrayBuffer without blowing the call stack on
 * large files (chunked `String.fromCharCode` + `btoa`).
 */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000; // 32 KB per chunk
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

/** A resolved vault file — `stat.mtime` lets the resolver cache by version. */
export interface FileLike {
  path: string;
  stat?: { mtime?: number };
}
/** Minimal Obsidian surface this helper needs — keeps it test-mockable. */
export interface VaultLike {
  read(file: { path: string }): Promise<string>;
  adapter: { readBinary(path: string): Promise<ArrayBuffer> };
  getAbstractFileByPath(path: string): FileLike | null;
}
export interface MetadataCacheLike {
  getFirstLinkpathDest(linkpath: string, sourcePath: string): FileLike | null;
}
export interface AppLike {
  vault: VaultLike;
  metadataCache: MetadataCacheLike;
}

/**
 * Build a synchronous `resolveImage` that returns `data:` URIs for
 * every image the deck references. Reads happen up-front (async);
 * the returned function is sync so it slots straight into the
 * render pass.
 *
 * Data URIs (not `app://`) are used because the preview iframe is
 * sandboxed with a null origin (`sandbox="allow-scripts"`), which
 * Chromium blocks from loading `app://` privileged resources. `data:`
 * URIs load in any origin, so the same approach works for both the
 * in-Obsidian preview and the portable standalone export.
 *
 * `cache` (optional) memoises encoded files by `path|mtime` so repeated
 * preview refreshes don't re-read + re-encode unchanged attachments.
 *
 * Resolution per target:
 *   - absolute/remote URL → returned as-is (passthrough)
 *   - resolvable to a vault file → inlined as data URI
 *   - otherwise → null (renderer keeps the raw path)
 */
export async function buildImageDataUriResolver(
  app: AppLike,
  deckFile: { path: string },
  cache?: Map<string, string>
): Promise<(path: string) => string | null> {
  const markdown = await app.vault.read(deckFile);
  const targets = collectImageTargets(markdown);
  const map = new Map<string, string>();

  for (const target of targets) {
    try {
      // Vault lookups need the DECODED path (a real filename), but the
      // map is keyed by BOTH raw + decoded so it matches whatever form
      // reaches the resolver: marked hands the renderer a possibly
      // percent-encoded `token.href`, while the embed preprocessor
      // hands it a literal (already-decoded) linkpath.
      const decoded = safeDecode(target);
      const dest =
        app.metadataCache.getFirstLinkpathDest(decoded, deckFile.path) ??
        app.vault.getAbstractFileByPath(decoded) ??
        app.metadataCache.getFirstLinkpathDest(target, deckFile.path) ??
        app.vault.getAbstractFileByPath(target);
      if (!dest) continue;

      const cacheKey = `${dest.path}|${dest.stat?.mtime ?? 0}`;
      let dataUri = cache?.get(cacheKey);
      if (!dataUri) {
        const buf = await app.vault.adapter.readBinary(dest.path);
        dataUri = `data:${mimeForExtension(dest.path)};base64,${arrayBufferToBase64(buf)}`;
        cache?.set(cacheKey, dataUri);
      }
      map.set(target, dataUri);
      if (decoded !== target) map.set(decoded, dataUri);
    } catch {
      // Unreadable attachment — skip; renderer keeps the raw path.
    }
  }

  return (path: string): string | null => {
    if (PASSTHROUGH.test(path)) return path;
    // Normalise wikilink brackets so a frontmatter `image: [[x.png]]`
    // value (passed raw to the resolver) matches the bracket-stripped
    // map keys, same as the body `![[x.png]]` / `![](x.png)` forms.
    const key = stripWikiBrackets(path);
    const hit = map.get(key);
    if (hit) return hit;
    const decoded = safeDecode(key);
    return decoded !== key ? map.get(decoded) ?? null : null;
  };
}
