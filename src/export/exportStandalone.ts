import { App, TFile } from "obsidian";
import { renderDeckStandalone, type RenderDefaults } from "../render/renderDeck";

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- runtime-only access
    const electron: { shell?: { openExternal: (url: string) => Promise<void> } } =
      require(electronModuleName);
    if (!electron.shell) return false;
    await electron.shell.openExternal("file://" + absolutePath + urlSuffix);
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
 * PDF-print variant — same export + open flow, but appends `?print-pdf`
 * to the file:// URL. Reveal.js detects this query string and renders
 * the deck flattened for printing (one slide per page). The user then
 * uses their browser's "Print → Save as PDF" to produce the PDF.
 */
export async function exportAndOpenForPdf(
  app: App,
  file: TFile,
  timestamp: number = Date.now(),
  defaults: RenderDefaults = {}
): Promise<ExportResult & { opened: boolean }> {
  const result = await exportDeckToFile(app, file, timestamp, defaults);
  const opened = await openExternalInBrowser(result.absolutePath, "?print-pdf");
  return { ...result, opened };
}
