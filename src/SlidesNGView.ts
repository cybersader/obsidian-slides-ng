import { ItemView, WorkspaceLeaf, TFile, TAbstractFile, Notice, ViewStateResult } from "obsidian";
import { renderDeck } from "./render/renderDeck";
import { exportAndOpen, exportAndOpenForPdf } from "./export/exportStandalone";
import { warmHighlighter } from "./render/shiki";
import type { SlidesNGSettings } from "./settings";

export const VIEW_TYPE_SLIDES_NG = "slides-ng-preview";

const REFRESH_DEBOUNCE_MS = 300;

interface SlidesNGViewState extends Record<string, unknown> {
  filePath?: string;
}

/** Lookup the view uses to read the current settings without holding a stale snapshot. */
export type SettingsAccessor = () => SlidesNGSettings;

export class SlidesNGView extends ItemView {
  private filePath?: string;
  private iframeEl?: HTMLIFrameElement;
  private refreshTimer: number | null = null;
  private getSettings: SettingsAccessor;

  constructor(leaf: WorkspaceLeaf, getSettings: SettingsAccessor) {
    super(leaf);
    this.getSettings = getSettings;
  }

  getViewType(): string {
    return VIEW_TYPE_SLIDES_NG;
  }

  getDisplayText(): string {
    if (this.filePath) {
      const name = this.filePath.split("/").pop() ?? this.filePath;
      return `Slides: ${name}`;
    }
    return "Slides preview";
  }

  getIcon(): string {
    return "presentation";
  }

  async setState(state: SlidesNGViewState, _result: ViewStateResult): Promise<void> {
    this.filePath = state.filePath;
    if (this.iframeEl) {
      await this.refresh();
    }
  }

  getState(): SlidesNGViewState {
    return { filePath: this.filePath };
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("slides-ng-view");

    // Toolbar
    const toolbar = container.createDiv({ cls: "slides-ng-toolbar" });
    const reloadBtn = toolbar.createEl("button", {
      cls: "slides-ng-toolbar-btn",
      text: "Reload",
    });
    reloadBtn.addEventListener("click", () => {
      void this.refresh();
    });

    const openBrowserBtn = toolbar.createEl("button", {
      cls: "slides-ng-toolbar-btn",
      text: "Open in browser",
    });
    openBrowserBtn.addEventListener("click", () => {
      void this.openInBrowser();
    });

    const printBtn = toolbar.createEl("button", {
      cls: "slides-ng-toolbar-btn",
      text: "Export for PDF",
    });
    printBtn.addEventListener("click", () => {
      void this.openInBrowserForPdf();
    });

    // Iframe
    this.iframeEl = container.createEl("iframe", {
      cls: "slides-ng-frame",
      attr: {
        sandbox: "allow-scripts",
      },
    });

    // Save-watch: when the active deck file is modified anywhere in the
    // vault (editor save, external write, sync), re-render after a short
    // debounce. registerEvent ties the lifetime to this view, so the
    // listener auto-detaches on close — no manual unhook needed.
    this.registerEvent(
      this.app.vault.on("modify", (file: TAbstractFile) => {
        if (this.filePath && file.path === this.filePath) {
          this.scheduleRefresh();
        }
      })
    );

    // Ensure Shiki is warm before the first render so syntax highlighting
    // AND magic-move keyed-token computation work on the first frame.
    // (Subsequent renders are unaffected — the highlighter caches itself.)
    await warmHighlighter().catch(() => undefined);
    await this.refresh();
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.iframeEl = undefined;
    this.contentEl.empty();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  private async refresh(): Promise<void> {
    if (!this.iframeEl) return;

    if (!this.filePath) {
      this.showPlaceholder("Open a markdown file, then run \"Slides NG: open preview\".");
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) {
      this.showPlaceholder(`File not found: ${this.filePath}`);
      return;
    }

    try {
      const markdown = await this.app.vault.read(file);
      const settings = this.getSettings();
      const html = renderDeck(markdown, file.path, {
        defaultTheme: settings.defaultTheme,
        defaultTransition: settings.defaultTransition,
        resolveImage: (raw) => this.resolveImageAttachment(raw, file.path),
      });
      this.iframeEl.srcdoc = html;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.showPlaceholder(`Render error: ${msg}`);
      new Notice(`slides-ng render error: ${msg}`);
    }
  }

  private showPlaceholder(message: string): void {
    if (!this.iframeEl) return;
    const safe = escapeHtml(message);
    this.iframeEl.srcdoc = `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:2rem;color:#888;background:#111;height:100%;margin:0;display:flex;align-items:center;justify-content:center;text-align:center"><p>${safe}</p></body>`;
  }

  async openInBrowser(): Promise<void> {
    const file = await this.resolveCurrentFile();
    if (!file) return;
    try {
      const result = await exportAndOpen(this.app, file, undefined, this.renderDefaults());
      if (result.opened) {
        new Notice(`Opened ${result.vaultRelativePath} in your default browser.`);
      } else {
        new Notice(
          `Wrote ${result.vaultRelativePath} but could not auto-launch the browser. Open it manually.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Open-in-browser failed: ${msg}`);
    }
  }

  async openInBrowserForPdf(): Promise<void> {
    const file = await this.resolveCurrentFile();
    if (!file) return;
    try {
      const result = await exportAndOpenForPdf(this.app, file, undefined, this.renderDefaults());
      if (result.opened) {
        new Notice("Opened in print mode. Use your browser's print → save as PDF.");
      } else {
        new Notice(
          `Wrote ${result.vaultRelativePath} but could not auto-launch the browser. Open manually + append ?print-pdf to the URL.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Export for PDF failed: ${msg}`);
    }
  }

  private async resolveCurrentFile(): Promise<TFile | null> {
    if (!this.filePath) {
      new Notice("No deck file is loaded.");
      return null;
    }
    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) {
      new Notice(`Deck file not found: ${this.filePath}`);
      return null;
    }
    return file;
  }

  private renderDefaults() {
    const s = this.getSettings();
    return { defaultTheme: s.defaultTheme, defaultTransition: s.defaultTransition };
  }

  /**
   * Resolve a `image:` frontmatter value (relative path or absolute URL)
   * to a URL the iframe-sandboxed reveal.js can load. Strategy:
   *   - http(s):// → use as-is
   *   - data: → use as-is
   *   - vault-relative path → look up via Obsidian's metadata cache + adapter
   *     and return getResourcePath() (which returns an `app://` URL the
   *     iframe can load)
   *   - not found → return null (renderer will fall back to the raw path)
   */
  private resolveImageAttachment(raw: string, deckPath: string): string | null {
    if (/^(https?:|data:|file:)/.test(raw)) return raw;
    const trimmed = raw.trim();
    const linktext = trimmed.replace(/^!?\[\[|\]\]$/g, "");
    const target = this.app.metadataCache.getFirstLinkpathDest(linktext, deckPath);
    if (target) {
      return this.app.vault.adapter.getResourcePath(target.path);
    }
    // Plain path (no wikilink syntax) — try direct adapter resolution.
    const file = this.app.vault.getAbstractFileByPath(trimmed);
    if (file && "path" in file) {
      return this.app.vault.adapter.getResourcePath(file.path);
    }
    return null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
