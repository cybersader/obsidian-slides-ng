import { App, TFile } from "obsidian";
import { renderDeckStandalone, type RenderDefaults } from "../render/renderDeck";

/**
 * Options the user picks before exporting to PDF. v0.9.0+. Each
 * field is optional so older callers (without a modal) still work.
 */
export interface PdfExportOptions {
  /**
   * Embed the speaker notes in the printed pages (reveal's
   * `?showNotes` URL param). Default false.
   */
  showNotes?: boolean;
  /**
   * Override the deck aspect ratio for printing. `"16:9"` and
   * `"4:3"` change the reveal-initialize width/height; `"current"`
   * uses whatever the deck's settings produce. Default `"current"`.
   */
  aspectRatio?: "16:9" | "4:3" | "current";
  /**
   * Override the deck theme. Useful for printing a dark-theme deck
   * in a light-theme layout that uses less ink. `null` = use the
   * deck's own theme. Default `null`.
   */
  themeOverride?: string | null;
  /**
   * Max pages per slide when content overflows (reveal's
   * `pdfMaxPagesPerSlide` URL param). Default 1.
   */
  maxPagesPerSlide?: number;
}

/**
 * Result of a single export run.
 */
export interface ExportResult {
  /** Path relative to the vault root, suitable for `app.vault.adapter.read`. */
  vaultRelativePath: string;
  /** Absolute on-disk path (for use with `electron.shell.openExternal`). */
  absolutePath: string;
  /** The full rendered HTML — useful for tests. */
  html: string;
}

/**
 * Build the filename used by the export workflow. Externalised so tests
 * can pin the timestamp.
 */
export function buildExportFilename(timestamp: number): string {
  return `.slides-ng-export-${timestamp}.html`;
}

/**
 * Render the deck file to a self-contained HTML document and write it to
 * the vault. Does NOT open the file — that's `openExternalInBrowser`'s job.
 * Split so unit tests can verify the write step without mocking Electron.
 */
export async function exportDeckToFile(
  app: App,
  file: TFile,
  timestamp: number = Date.now(),
  defaults: RenderDefaults = {}
): Promise<ExportResult> {
  const markdown = await app.vault.read(file);
  const html = renderDeckStandalone(markdown, file.path, defaults);
  const vaultRelativePath = buildExportFilename(timestamp);
  await app.vault.adapter.write(vaultRelativePath, html);

  // Resolve to an absolute on-disk path. The Obsidian filesystem adapter
  // exposes this through `getFullPath` (public on the DesktopAdapter).
  // We narrow with a type guard so the cross-platform code path stays
  // explicit; mobile builds won't see this codepath since the plugin is
  // `isDesktopOnly: true`.
  const adapter = app.vault.adapter as unknown as {
    getFullPath?: (path: string) => string;
  };
  const absolutePath =
    typeof adapter.getFullPath === "function"
      ? adapter.getFullPath(vaultRelativePath)
      : vaultRelativePath;

  return { vaultRelativePath, absolutePath, html };
}

/**
 * v0.11.31: convert an absolute filesystem path to a `file:///` URL.
 * On Windows `C:\path\file.html` must become `file:///C:/path/file.html`
 * (three slashes, forward slashes only). On Unix `/home/.../file.html`
 * already starts with `/`, so `file://` + path naturally produces
 * `file:///home/...`. Previously we naively did `"file://" + absolutePath`,
 * which on Windows produced `file://C:\path\file.html?print-pdf` —
 * malformed URL → browsers ignore the query string → PDF print mode
 * never triggered (and "showNotes=true" never landed). This was the
 * user-reported "PDF options don't persist in the opened browser" bug.
 */
export function pathToFileUrl(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  // v0.11.40: URL-encode each path segment so reserved chars in the
  // path (`&`, ` `, `?`, `#`, etc.) don't get parsed as URL syntax.
  // User reported their vault path contains `b&g` and the unencoded
  // `&` in the path was being mistaken for a query separator —
  // browsers dropped the entire `?print-pdf&showNotes=true` query
  // string. Encoding each segment individually preserves `/` as the
  // path separator while encoding everything else.
  const segments = normalized.split("/").map((seg, i) => {
    // Leave the drive letter (`C:`) untouched on Windows — the colon
    // is part of the file: URL scheme convention and `encodeURIComponent`
    // would mangle it to `C%3A`.
    if (i === 0 && /^[a-zA-Z]:$/.test(seg)) return seg;
    return encodeURIComponent(seg);
  });
  const encoded = segments.join("/");
  if (encoded.startsWith("/")) {
    return "file://" + encoded;
  }
  return "file:///" + encoded;
}

/**
 * Open a `file://` URL in the user's default browser via Electron's
 * `shell.openExternal`. Pure-IPC, no spawned process, no listening port.
 * Returns true on success, false if Electron isn't available (e.g. in
 * a unit-test environment) so the caller can show a sensible Notice.
 *
 * `urlSuffix` (e.g. `?print-pdf`) is appended verbatim after the file
 * path so callers can flip reveal.js into print mode.
 */
export async function openExternalInBrowser(
  absolutePath: string,
  urlSuffix = ""
): Promise<boolean> {
  // `electron` is supplied at runtime by Obsidian's renderer host. We
  // require it through a non-static specifier so esbuild doesn't try to
  // bundle it (the build config also marks it external).
  const electronModuleName = "electron";
  try {
    // Runtime-only access; the rule that would normally fire here isn't
    // configured in our eslint setup, so no disable directive needed.
    const electron: { shell?: { openExternal: (url: string) => Promise<void> } } =
      require(electronModuleName);
    if (!electron.shell) return false;
    await electron.shell.openExternal(pathToFileUrl(absolutePath) + urlSuffix);
    return true;
  } catch {
    return false;
  }
}

/**
 * Combined workflow: render + write + open. The common path for the
 * "Open in browser" button. Returns the export result so the caller
 * can show a Notice with the path.
 */
export async function exportAndOpen(
  app: App,
  file: TFile,
  timestamp: number = Date.now(),
  defaults: RenderDefaults = {}
): Promise<ExportResult & { opened: boolean }> {
  const result = await exportDeckToFile(app, file, timestamp, defaults);
  const opened = await openExternalInBrowser(result.absolutePath);
  return { ...result, opened };
}

/**
 * Build the URL suffix for PDF print mode given the user's options.
 * Combines reveal's print-pdf flag with any optional query params
 * the user selected in the export dialog.
 */
export function buildPdfUrlSuffix(opts: PdfExportOptions = {}): string {
  const params: string[] = ["print-pdf"];
  if (opts.showNotes) params.push("showNotes=true");
  if (opts.maxPagesPerSlide && opts.maxPagesPerSlide > 1) {
    params.push(`pdfMaxPagesPerSlide=${opts.maxPagesPerSlide}`);
  }
  return "?" + params.join("&");
}

/**
 * PDF-print variant — same export + open flow, but appends print-mode
 * URL params built from the user's PdfExportOptions. Theme + aspect-
 * ratio overrides flow through `defaults` so the rendered HTML's
 * Reveal.initialize() gets the right config; URL-only flags (notes,
 * pdfMaxPagesPerSlide) are encoded in the suffix.
 */
export async function exportAndOpenForPdf(
  app: App,
  file: TFile,
  timestamp: number = Date.now(),
  defaults: RenderDefaults = {},
  pdfOptions: PdfExportOptions = {}
): Promise<ExportResult & { opened: boolean }> {
  // Apply theme / aspect ratio overrides into the render defaults.
  const merged: RenderDefaults = { ...defaults };
  if (pdfOptions.themeOverride) {
    merged.defaultTheme = pdfOptions.themeOverride;
  }
  if (pdfOptions.aspectRatio === "16:9") {
    merged.pdfAspectWidth = 1280;
    merged.pdfAspectHeight = 720;
  } else if (pdfOptions.aspectRatio === "4:3") {
    merged.pdfAspectWidth = 1024;
    merged.pdfAspectHeight = 768;
  }
  const result = await exportDeckToFile(app, file, timestamp, merged);
  const suffix = buildPdfUrlSuffix(pdfOptions);
  const opened = await openExternalInBrowser(result.absolutePath, suffix);
  return { ...result, opened };
}
