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

/**
 * URLs that are already loadable inside the sandboxed iframe and need no
 * embedding: remote `http(s):` and inline `data:`. NOTE `file:` is
 * deliberately NOT here — a `file://` that points inside the vault is
 * inlined as a data URI (Chromium blocks `file://` in a null-origin
 * iframe), while a `file://` we can't resolve is left untouched.
 * `app://local/…` is likewise resolved (not passed through), since that
 * privileged scheme is also blocked in the sandbox.
 */
const PASSTHROUGH = /^(https?:|data:)/i;

/**
 * Capture the `src` value of an HTML `<img>` tag: double-quoted (group
 * 1), single-quoted (group 2), or unquoted (group 3). The attribute skip
 * treats quoted values as atomic (so a `>` or `src=` inside an earlier
 * attribute is ignored) and `(?<![-\w])src` anchors on a real `src`, not
 * `data-src`. Kept in lockstep with obsidianEmbeds.ts IMG_SRC_ATTR_RE so
 * collection and rewriting agree on the same attribute.
 */
const IMG_SRC_RE =
  /<img\b(?:"[^"]*"|'[^']*'|[^>"'])*?(?<![-\w])src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/**
 * Session-scoped cache of encoded attachments, keyed by `path|mtime`.
 * Shared across the main preview, speaker up-next, and speaker picker
 * iframes so a given attachment is read from disk at most once per
 * session (keys self-invalidate on save via the changed mtime). This
 * matters most over slow shares (SMB/VPN) where re-reading image bytes
 * per iframe would add real latency to opening the speaker view.
 */
export const sharedImageDataUriCache = new Map<string, string>();

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

  // Raw HTML <img src="…"> tags authored directly in the deck (users lay
  // out slides with hand-written HTML). marked passes these through
  // verbatim, so their src must be resolved to a data URI too — else the
  // sandboxed null-origin iframe can't load them. Quoted + unquoted.
  for (const m of markdown.matchAll(IMG_SRC_RE)) {
    const val = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    addIfLocal(val);
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
  adapter: {
    readBinary(path: string): Promise<ArrayBuffer>;
    /**
     * Absolute on-disk path of the vault root (Obsidian's
     * FileSystemAdapter.getBasePath). Optional so tests can omit it;
     * used to map absolute `file://` / `app://local/` srcs back to a
     * vault-relative path.
     */
    getBasePath?(): string;
  };
  getAbstractFileByPath(path: string): FileLike | null;
}
export interface MetadataCacheLike {
  getFirstLinkpathDest(linkpath: string, sourcePath: string): FileLike | null;
}
export interface AppLike {
  vault: VaultLike;
  metadataCache: MetadataCacheLike;
}

/** Folder of a vault path (`a/b/c.md` → `a/b`; root file → `""`). */
function parentFolder(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : "";
}

/**
 * Collapse `.` / `..` / empty segments in a forward-slash path.
 * Leading `..` that would escape the root are dropped (best effort).
 */
function normalizeSlashPath(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

/**
 * Strip a resource scheme + any `?query`/`#hash` from an image ref,
 * returning a bare path. Handles `app://local/…`, `file://[/]…`, and a
 * leading `./`. Backslashes are normalised to `/` so Windows paths
 * compare cleanly. Percent-encoding is left intact for the caller to
 * decode (so both encoded + decoded keys can be tried).
 */
function stripScheme(ref: string): string {
  let s = ref.trim();
  s = s.replace(/^app:\/\/local\//i, "");
  s = s.replace(/^file:\/\/\/?/i, "");
  s = s.replace(/[?#].*$/, "");
  s = s.replace(/\\/g, "/");
  s = s.replace(/^\.\//, "");
  return s;
}

/**
 * Map an absolute on-disk path to a vault-relative path by stripping the
 * vault's base path. Comparison is slash-normalised + case-insensitive
 * (Windows drives), but the RETURNED remainder keeps its original case
 * (vault paths are case-sensitive lookups). Returns null when `abs`
 * isn't under `base`.
 */
function stripBasePath(abs: string, base: string): string | null {
  // Strip a leading slash from BOTH sides: `stripScheme` removes the
  // leading `/` of a POSIX absolute path (`file:///Users/…` → `Users/…`)
  // while getBasePath() keeps it (`/Users/…`). Windows drive-letter bases
  // (`Y:/…`) have no leading slash, so this is a no-op there.
  const a = abs.replace(/\\/g, "/").replace(/^\/+/, "");
  const b = base.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!b) return null;
  const prefix = b.toLowerCase() + "/";
  if (a.toLowerCase().startsWith(prefix)) return a.slice(prefix.length);
  return null;
}

/**
 * Resolve an image reference (wikilink target, markdown href, or raw
 * `<img>` src) to a vault file, trying, in order: the ref as authored,
 * the scheme-stripped ref, the ref relative to the deck's folder, and
 * (for absolute `file://`/`app://local/` paths) the ref with the vault
 * base path removed. Returns null when nothing matches.
 */
function findDest(
  app: AppLike,
  ref: string,
  deckPath: string,
  basePath: string | undefined
): FileLike | null {
  const tryPath = (p: string): FileLike | null => {
    if (!p) return null;
    return (
      app.metadataCache.getFirstLinkpathDest(p, deckPath) ??
      app.vault.getAbstractFileByPath(p)
    );
  };
  const tryBoth = (p: string): FileLike | null => {
    const decoded = safeDecode(p);
    return tryPath(decoded) ?? (decoded !== p ? tryPath(p) : null);
  };

  // 1. As authored (covers wikilinks + plain vault paths).
  let dest = tryBoth(ref);
  if (dest) return dest;

  // 2. Scheme-stripped (app://local/, file://, ./, query/hash removed).
  const bare = stripScheme(ref);
  if (bare !== ref) {
    dest = tryBoth(bare);
    if (dest) return dest;
  }

  // 3. Relative to the deck's own folder (e.g. `_attachments/x.png`).
  const dir = parentFolder(deckPath);
  if (dir) {
    dest = tryBoth(normalizeSlashPath(`${dir}/${safeDecode(bare)}`));
    if (dest) return dest;
  }

  // 4. Absolute on-disk path → strip the vault base path.
  if (basePath) {
    const rel = stripBasePath(safeDecode(bare), basePath);
    if (rel) {
      dest = tryPath(rel);
      if (dest) return dest;
    }
  }

  return null;
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
 * Pass {@link sharedImageDataUriCache} to share encoded bytes across the
 * main preview + speaker up-next + picker iframes, so each attachment is
 * read from disk once per session — important over slow shares (SMB/VPN).
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
  const basePath = app.vault.adapter.getBasePath?.();

  for (const target of targets) {
    try {
      // findDest tries the ref as authored, scheme-stripped, relative to
      // the deck folder, and (for absolute file://app://local paths) with
      // the vault base path removed. The map is keyed by BOTH the raw
      // target and its decoded form so it matches whatever string reaches
      // the resolver — marked hands the renderer a possibly
      // percent-encoded `token.href`, the embed preprocessor hands it a
      // literal linkpath, and the <img> rewrite hands it the authored src.
      const decoded = safeDecode(target);
      const dest = findDest(app, target, deckFile.path, basePath);
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
