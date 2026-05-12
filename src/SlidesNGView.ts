import {
  ItemView,
  WorkspaceLeaf,
  TFile,
  TAbstractFile,
  Notice,
  ViewStateResult,
  MarkdownView,
  setIcon,
  setTooltip,
} from "obsidian";
import { VIEW_TYPE_SLIDES_NG_SPEAKER } from "./SlidesNGSpeakerView";
import { renderDeck } from "./render/renderDeck";
import { exportAndOpen, exportAndOpenForPdf } from "./export/exportStandalone";
import { warmHighlighter } from "./render/shiki";
import { slideIndexFromCursor } from "./parser/slideIndexFromCursor";
import type { SlidesNGSettings } from "./settings";

export const VIEW_TYPE_SLIDES_NG = "slides-ng-preview";

const REFRESH_DEBOUNCE_MS = 300;

interface SlidesNGViewState extends Record<string, unknown> {
  filePath?: string;
}

/** Lookup the view uses to read the current settings without holding a stale snapshot. */
export type SettingsAccessor = () => SlidesNGSettings;

/**
 * Returns the user's intended deck file. Plugin-supplied — combines the
 * current active MarkdownView with a tracked "last markdown file" so
 * toolbar clicks that steal focus from the markdown view still resolve
 * to the right file. See `SlidesNGPlugin.resolveActiveDeckFile`.
 */
export type DeckFileAccessor = () => TFile | null;

export class SlidesNGView extends ItemView {
  private filePath?: string;
  private iframeEl?: HTMLIFrameElement;
  private refreshTimer: number | null = null;
  private cursorFollowTimer: number | null = null;
  private lastSentSlideIdx: number | null = null;
  private getSettings: SettingsAccessor;
  private resolveDeckFile: DeckFileAccessor;

  constructor(
    leaf: WorkspaceLeaf,
    getSettings: SettingsAccessor,
    resolveDeckFile: DeckFileAccessor
  ) {
    super(leaf);
    this.getSettings = getSettings;
    this.resolveDeckFile = resolveDeckFile;
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

    // Toolbar — icon + label, grouped: render-controls on the left,
    // open-out controls + speaker on the right.
    const toolbar = container.createDiv({ cls: "slides-ng-toolbar" });
    const leftGroup = toolbar.createDiv({ cls: "slides-ng-toolbar-group" });
    const spacer = toolbar.createDiv({ cls: "slides-ng-toolbar-spacer" });
    void spacer;
    const rightGroup = toolbar.createDiv({ cls: "slides-ng-toolbar-group" });

    this.addToolbarButton(leftGroup, {
      icon: "refresh-cw",
      label: "Reload",
      tooltip: "Re-render the deck",
      onClick: () => void this.refresh(),
    });

    this.addToolbarButton(leftGroup, {
      icon: "file-input",
      label: "Use current",
      tooltip: "Load the currently-focused markdown file as the deck",
      onClick: () => void this.useCurrentFile(),
    });

    this.addToolbarButton(leftGroup, {
      icon: "list",
      label: "Menu",
      tooltip: "Toggle the in-iframe menu (heading outline + slide list)",
      onClick: () => this.postIframeCommand("toggleMenu"),
    });

    this.addToolbarButton(rightGroup, {
      icon: "monitor-play",
      label: "Speaker",
      tooltip: "Open speaker view (notes + controls)",
      onClick: () => void this.openSpeakerView(),
    });

    this.addToolbarButton(rightGroup, {
      icon: "external-link",
      label: "Open in browser",
      tooltip: "Export + open fullscreen in your default browser",
      onClick: () => void this.openInBrowser(),
    });

    this.addToolbarButton(rightGroup, {
      icon: "file-down",
      label: "Export PDF",
      tooltip: "Export + open in print-mode for browser PDF save",
      onClick: () => void this.openInBrowserForPdf(),
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

    // Cursor-follow: when the editor selection changes inside the deck
    // file, postMessage the iframe to jump to the matching slide.
    // selectionchange fires for every cursor move + every keystroke; the
    // debounce + active-view guard keep it cheap.
    this.registerDomEvent(document, "selectionchange", () => {
      if (!this.getSettings().followCursorInEditor) return;
      this.scheduleCursorFollow();
    });

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
    if (this.cursorFollowTimer !== null) {
      window.clearTimeout(this.cursorFollowTimer);
      this.cursorFollowTimer = null;
    }
    this.iframeEl = undefined;
    this.contentEl.empty();
  }

  private addToolbarButton(
    parent: HTMLElement,
    opts: {
      icon: string;
      label: string;
      tooltip?: string;
      variant?: "accent";
      onClick: () => void;
    }
  ): HTMLButtonElement {
    const btn = parent.createEl("button", {
      cls: "slides-ng-toolbar-btn" + (opts.variant === "accent" ? " mod-cta" : ""),
    });
    const iconEl = btn.createSpan({ cls: "slides-ng-toolbar-btn-icon" });
    setIcon(iconEl, opts.icon);
    btn.createSpan({ cls: "slides-ng-toolbar-btn-label", text: opts.label });
    if (opts.tooltip) setTooltip(btn, opts.tooltip);
    btn.addEventListener("click", opts.onClick);
    return btn;
  }

  /**
   * Swap the previewed deck to the currently-focused markdown file. When
   * the user is presenting from one deck but glancing at notes in other
   * markdown files, the preview stays put (no auto-follow); clicking this
   * button explicitly loads whichever file they're currently editing.
   *
   * No-op if no markdown view is active or it's already the loaded file.
   */
  private async useCurrentFile(): Promise<void> {
    // Don't use `getActiveViewOfType(MarkdownView)?.file` directly here —
    // clicking the toolbar steals focus from the markdown view BEFORE
    // the click handler runs, so the active view becomes the preview
    // itself and the lookup returns null. The plugin-level resolver
    // tracks `lastMarkdownFile` via active-leaf-change for this exact
    // case (same fix as the ribbon-button focus-steal in v0.5.4).
    const file = this.resolveDeckFile();
    if (!file) {
      new Notice("No Markdown file is focused.");
      return;
    }
    if (file.path === this.filePath) {
      await this.refresh();
      return;
    }
    await this.leaf.setViewState({
      type: VIEW_TYPE_SLIDES_NG,
      active: true,
      state: { filePath: file.path },
    });
  }

  private async openSpeakerView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_SLIDES_NG_SPEAKER);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getLeaf("split", "horizontal");
    await leaf.setViewState({
      type: VIEW_TYPE_SLIDES_NG_SPEAKER,
      active: true,
    });
    workspace.revealLeaf(leaf);
  }

  /**
   * Post a command to the iframe. Public so the speaker view can drive
   * navigation without re-finding the iframe itself.
   */
  postIframeCommand(cmd: string, idx?: number): void {
    const win = this.iframeEl?.contentWindow;
    if (!win) return;
    win.postMessage({ type: "slides-ng-cmd", cmd, idx }, "*");
  }

  private scheduleCursorFollow(): void {
    if (this.cursorFollowTimer !== null) {
      window.clearTimeout(this.cursorFollowTimer);
    }
    this.cursorFollowTimer = window.setTimeout(() => {
      this.cursorFollowTimer = null;
      this.applyCursorFollow();
    }, 150);
  }

  private applyCursorFollow(): void {
    if (!this.iframeEl?.contentWindow || !this.filePath) return;
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!mdView?.file || mdView.file.path !== this.filePath) return;
    const cursor = mdView.editor.getCursor();
    const md = mdView.editor.getValue();
    const idx = slideIndexFromCursor(md, cursor.line);
    if (idx === this.lastSentSlideIdx) return;
    this.lastSentSlideIdx = idx;
    this.iframeEl.contentWindow.postMessage(
      { type: "slides-ng-cmd", cmd: "goto", idx },
      "*"
    );
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
        defaultLayout: settings.defaultLayout,
        codeTheme: settings.codeTheme,
        imageLayoutSplit: settings.imageLayoutSplit,
        lineStepDimOpacity: settings.lineStepDimOpacity,
        showRevealControlsEmbedded: settings.showRevealControlsEmbedded,
        showRevealMenuEmbedded: settings.showRevealMenuEmbedded,
        codeBlockMaxHeight: settings.codeBlockMaxHeight,
        codeBlockOverflowScroll: settings.codeBlockOverflowScroll,
        transitionSpeed: settings.transitionSpeed,
        magicMoveDurationMs: settings.magicMoveDurationMs,
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
    return {
      defaultTheme: s.defaultTheme,
      defaultTransition: s.defaultTransition,
      defaultLayout: s.defaultLayout,
      codeTheme: s.codeTheme,
      imageLayoutSplit: s.imageLayoutSplit,
      lineStepDimOpacity: s.lineStepDimOpacity,
      codeBlockMaxHeight: s.codeBlockMaxHeight,
      codeBlockOverflowScroll: s.codeBlockOverflowScroll,
      transitionSpeed: s.transitionSpeed,
      magicMoveDurationMs: s.magicMoveDurationMs,
      // showRevealControlsEmbedded + showRevealMenuEmbedded intentionally
      // not threaded into standalone exports — standalone mode shows
      // controls + menu regardless.
    };
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
