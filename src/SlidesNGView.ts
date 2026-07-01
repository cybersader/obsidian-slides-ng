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
import {
  exportAndOpen,
  exportAndOpenForPdf,
  type PdfExportOptions,
} from "./export/exportStandalone";
import { ExportPdfOptionsModal } from "./ExportPdfOptionsModal";
import { warmHighlighter } from "./render/shiki";
import { slideIndexFromCursor } from "./parser/slideIndexFromCursor";
import { sourceLineForSlide } from "./parser/slideSourceLine";
import { buildImageDataUriResolver } from "./export/imageDataUris";
import type { SlidesNGSettings } from "./settings";
import type { DebugLog } from "./utils/debug";

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
  private reverseFollowTimer: number | null = null;
  /**
   * The last (h, v) slide position synced BETWEEN editor and preview.
   * Both follow directions consult + set this so neither echoes the
   * other into an infinite loop: a state/cursor change that already
   * matches the synced position is treated as our own echo and ignored.
   */
  private lastSentSlideIdx: number | null = null;
  private lastSyncedV = 0;
  /**
   * v0.13.6: current slide position shown in the preview, tracked from
   * the iframe's `slides-ng-state` messages. Used by the reverse
   * (preview → editor) follow + the "Find in note" button.
   */
  private currentPreviewH = 0;
  private currentPreviewV = 0;
  /**
   * v0.13.4: data-URI cache for image attachments, keyed by
   * `path|mtime`. Reused across refreshes so unchanged images aren't
   * re-read + re-base64'd on every keystroke.
   */
  private imageDataUriCache = new Map<string, string>();
  private getSettings: SettingsAccessor;
  private resolveDeckFile: DeckFileAccessor;
  private debug?: DebugLog;
  /** v0.11.39: iframe error message listener (cleaned up onClose). */
  private iframeErrorHandler?: (e: MessageEvent) => void;
  /** Parent-side ResizeObserver on the iframe element; posts `relayout` to the bridge. */
  private iframeResizeObserver?: ResizeObserver;
  /**
   * Rendered HTML waiting to be applied to `iframeEl.srcdoc`. Set by
   * `refresh()`; consumed by `applyPendingIfReady()` once the iframe
   * has non-zero dimensions. Eliminates the v0.10.5/.6/.7 issue where
   * srcdoc was being set 3-4 times in quick succession (once per
   * refresh trigger) — the browser would mid-cancel each load, leaving
   * the iframe stuck in a broken intermediate state until something
   * outside our control (collapse+reopen sidebar) forced a relayout.
   * v0.10.8+.
   */
  private pendingHtml: string | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    getSettings: SettingsAccessor,
    resolveDeckFile: DeckFileAccessor,
    debug?: DebugLog
  ) {
    super(leaf);
    this.getSettings = getSettings;
    this.resolveDeckFile = resolveDeckFile;
    this.debug = debug;
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
    this.debug?.log("view/setState", {
      stateFilePath: state.filePath,
      hadIframe: !!this.iframeEl,
      prevFilePath: this.filePath,
    });
    this.filePath = state.filePath;
    if (this.iframeEl) {
      await this.refresh();
    }
  }

  getState(): SlidesNGViewState {
    return { filePath: this.filePath };
  }

  async onOpen(): Promise<void> {
    this.debug?.log("view/onOpen/enter", { filePath: this.filePath });
    // v0.11.39: capture any iframe-side error and persist to debug.log
    // so the user can share specific failures. Installed once per view
    // open; auto-cleans on close. Errors only get persisted when
    // debugLogging is enabled.
    this.iframeErrorHandler = (event: MessageEvent) => {
      const data = event.data as
        | {
            type?: string;
            label?: string;
            message?: string;
            stack?: string | null;
            time?: number;
            [k: string]: unknown;
          }
        | undefined;
      if (!data || typeof data.type !== "string") return;
      // v0.11.48: also capture the bootstrap heartbeat and the
      // watchdog state snapshot so we know exactly which stage
      // failed when the user reports a black screen.
      switch (data.type) {
        case "slides-ng-iframe-error":
          this.debug?.log("iframe/error", {
            label: data.label,
            message: data.message,
            stack: data.stack,
            time: data.time,
          });
          break;
        case "slides-ng-iframe-bootstrap":
          this.debug?.log("iframe/bootstrap", {
            time: data.time,
            hasReveal: data.hasReveal,
          });
          break;
        case "slides-ng-state":
          // v0.13.6: track the slide the preview is currently showing
          // (for the "Find in note" button) and, when two-way follow
          // is on, move the editor caret to match.
          if (typeof data.currentIdx === "number") {
            this.currentPreviewH = data.currentIdx;
          }
          if (typeof data.currentVIdx === "number") {
            this.currentPreviewV = data.currentVIdx;
          }
          if (this.getSettings().followPreviewInEditor) {
            const h = this.currentPreviewH;
            const v = this.currentPreviewV;
            // Ignore the echo of our OWN forward-follow (editor→preview
            // already put us here). Only react to genuine preview
            // navigation.
            if (h !== this.lastSentSlideIdx || v !== this.lastSyncedV) {
              this.scheduleReverseFollow();
            }
          }
          break;
        case "slides-ng-iframe-reveal-ready":
          this.debug?.log("iframe/reveal-ready", { time: data.time });
          // v0.13.4: once reveal is up, jump to the slide the editor
          // caret is on — so opening the preview lands on the slide
          // you were editing instead of always slide 1. Reset the
          // de-dupe guard so the goto definitely fires.
          if (this.getSettings().followCursorInEditor) {
            this.lastSentSlideIdx = null;
            this.applyCursorFollow();
          }
          break;
        case "slides-ng-iframe-watchdog":
          this.debug?.log("iframe/watchdog", {
            readyFired: data.readyFired,
            slidesCount: data.slidesCount,
            presentCount: data.presentCount,
            viewportSize: data.viewportSize,
            docSize: data.docSize,
            firstSectionDisplay: data.firstSectionDisplay,
          });
          break;
      }
    };
    window.addEventListener("message", this.iframeErrorHandler);
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

    // v0.11.7: Prev / Next nav buttons in the preview toolbar.
    // Users asked for nav arrows visible somewhere — reveal's stock
    // controls are off by default to keep slides uncluttered, so
    // toolbar buttons fill that gap.
    this.addToolbarButton(leftGroup, {
      icon: "chevron-left",
      label: "Prev",
      tooltip: "Previous slide",
      onClick: () => this.postIframeCommand("prev"),
    });
    this.addToolbarButton(leftGroup, {
      icon: "chevron-right",
      label: "Next",
      tooltip: "Next slide",
      onClick: () => this.postIframeCommand("next"),
    });

    // v0.11.8: Menu toolbar button removed. After several rounds of
    // fixes (v0.10.2 via Reveal.getPlugin('menu').toggle(), v0.11.3
    // via .slide-menu-button.click()), the reveal-menu plugin's
    // toggle remained unreliable in the embedded iframe context for
    // some users. The Grid button already covers slide navigation
    // (and shows real thumbnails). The reveal-menu plugin is still
    // loaded so its keyboard shortcut (M) works inside the iframe
    // for anyone who wants the side-panel experience.

    this.addToolbarButton(leftGroup, {
      // v0.10.2: switched from `grid-3x3` to `layout-grid` — the
      // former isn't reliably bundled in older Obsidian Lucide sets
      // and rendered as a blank space in the toolbar.
      icon: "layout-grid",
      label: "Grid",
      tooltip: "Toggle the slide-grid overview",
      onClick: () => this.postIframeCommand("toggleOverview"),
    });

    // v0.13.6: reverse cursor-follow. Jump the editor caret to the
    // source of the slide currently shown in the preview.
    this.addToolbarButton(leftGroup, {
      icon: "crosshair",
      label: "Find in note",
      tooltip: "Jump the editor cursor to this slide's source (+ focus)",
      onClick: () =>
        this.moveEditorToSlide(this.currentPreviewH, this.currentPreviewV, true),
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

    // v0.10.4: parent-side ResizeObserver on the iframe element.
    // The in-iframe ResizeObserver (added in v0.10.2) observes
    // `document.documentElement`, which doesn't reliably emit a
    // resize event when the OUTER iframe element resizes in
    // Electron — this was the v0.10.x black-pane-on-ribbon-open
    // bug. Watching the outer element from the parent context is
    // authoritative.
    if (typeof ResizeObserver === "function") {
      const postRelayoutBurst = (): void => {
        // Single-shot postMessage may land before the iframe's bridge
        // listener is up (srcdoc just set, scripts still parsing).
        // Burst: fire now + at a few short delays to cover the race.
        this.postIframeCommand("relayout");
        for (const delay of [60, 180, 400, 900]) {
          window.setTimeout(() => this.postIframeCommand("relayout"), delay);
        }
      };
      const ro = new ResizeObserver(() => {
        if (!this.iframeEl) return;
        if (this.iframeEl.clientWidth === 0 || this.iframeEl.clientHeight === 0) return;
        // v0.10.8: two cases —
        //   (1) pendingHtml is queued: apply now that the iframe is
        //       real-sized. Reveal initialises ONCE into a proper
        //       viewport. Old v0.10.7's "re-render at real size"
        //       race issue (srcdoc set 3-4 times in quick succession,
        //       browser mid-cancelling each load) is gone — there's
        //       only ever one srcdoc assignment per refresh now.
        //   (2) pendingHtml empty: just post the relayout burst so
        //       the in-iframe reveal recomputes for the new size.
        if (this.pendingHtml !== null) {
          this.applyPendingIfReady();
          this.debug?.log("view/resize/apply-pending", {
            clientW: this.iframeEl.clientWidth,
            clientH: this.iframeEl.clientHeight,
          });
          return;
        }
        postRelayoutBurst();
        this.debug?.log("view/resize/post-relayout", {
          clientW: this.iframeEl.clientWidth,
          clientH: this.iframeEl.clientHeight,
        });
      });
      ro.observe(this.iframeEl);
      this.iframeResizeObserver = ro;
    }

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

    // v0.10.1: defensive file-resolution. If setState ran with a
    // null filePath (ribbon click before active-leaf-change fired)
    // OR didn't fire at all in this lifecycle, fall back to the
    // plugin's `lastMarkdownFile` tracker. Without this fallback
    // the user saw a blank pane until they clicked Reload.
    if (!this.filePath) {
      const fallback = this.resolveDeckFile();
      if (fallback) this.filePath = fallback.path;
    }

    // v0.10.1: warm Shiki in the background instead of blocking the
    // first render. Awaiting it here was the root of "ribbon opens
    // preview but deck doesn't show until you click Reload" — if the
    // highlighter took longer than expected (cold start, slow disk),
    // the final refresh() below never fired and the user saw a blank
    // iframe. The highlighter is warmed eagerly in main.ts onload as
    // well, so by the time the user opens a deck it's usually ready;
    // if it isn't, the first render falls back to plain <pre><code>
    // and re-renders with colour on the next file modify or Reload.
    void warmHighlighter().then(() => {
      // Once warm, re-render so any code blocks pick up syntax
      // highlighting. Cheap because renderDeck caches per-fence.
      if (this.iframeEl && this.filePath) {
        void this.refresh();
      }
    });
    await this.refresh();
    this.debug?.log("view/onOpen/exit", { filePath: this.filePath });
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
    if (this.reverseFollowTimer !== null) {
      window.clearTimeout(this.reverseFollowTimer);
      this.reverseFollowTimer = null;
    }
    if (this.iframeResizeObserver) {
      this.iframeResizeObserver.disconnect();
      this.iframeResizeObserver = undefined;
    }
    if (this.iframeErrorHandler) {
      window.removeEventListener("message", this.iframeErrorHandler);
      this.iframeErrorHandler = undefined;
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
    // New tab next to the preview pane (rather than a horizontal split)
    // so the speaker view doesn't shrink the preview by default. Drag-
    // to-popout or manual split for simultaneous visibility.
    const leaf = workspace.getLeaf("tab");
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

  /**
   * Find the Markdown editor showing this deck file — among ALL open
   * markdown panes, not just the active one. v0.13.4: the previous
   * `getActiveViewOfType` lookup failed whenever the preview pane (or
   * anything else) was the active view, which is exactly the case
   * right after opening the preview — so the initial cursor-follow
   * jump never happened.
   */
  private findDeckMarkdownView(): MarkdownView | null {
    if (!this.filePath) return null;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const v = leaf.view;
      if (v instanceof MarkdownView && v.file?.path === this.filePath) {
        return v;
      }
    }
    return null;
  }

  private applyCursorFollow(): void {
    if (!this.iframeEl?.contentWindow || !this.filePath) return;
    const mdView = this.findDeckMarkdownView();
    if (!mdView) return;
    const cursor = mdView.editor.getCursor();
    const md = mdView.editor.getValue();
    const idx = slideIndexFromCursor(md, cursor.line, {
      autoH1Breaks: this.getSettings().autoH1Breaks,
    });
    if (idx === this.lastSentSlideIdx) return;
    // `goto idx` lands reveal at (idx, 0), so the synced vertical is 0.
    // Recording it here means the resulting state echo is recognised
    // and doesn't bounce the caret back via the reverse follow.
    this.lastSentSlideIdx = idx;
    this.lastSyncedV = 0;
    this.iframeEl.contentWindow.postMessage(
      { type: "slides-ng-cmd", cmd: "goto", idx },
      "*"
    );
  }

  private scheduleReverseFollow(): void {
    if (this.reverseFollowTimer !== null) {
      window.clearTimeout(this.reverseFollowTimer);
    }
    this.reverseFollowTimer = window.setTimeout(() => {
      this.reverseFollowTimer = null;
      // Auto-follow: move the caret but DON'T steal focus/reveal — the
      // user is navigating the preview and shouldn't get yanked away.
      this.moveEditorToSlide(this.currentPreviewH, this.currentPreviewV, false);
    }, 120);
  }

  /**
   * v0.13.6: move the editor caret to the source line of slide (h, v).
   * `focus` true → also reveal + focus the editor pane (manual "Find in
   * note" button); false → just move the caret + scroll (auto two-way
   * follow, no focus theft).
   */
  private moveEditorToSlide(h: number, v: number, focus: boolean): void {
    if (!this.filePath) return;
    let targetLeaf: WorkspaceLeaf | null = null;
    let mdView: MarkdownView | null = null;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === this.filePath) {
        targetLeaf = leaf;
        mdView = view;
        break;
      }
    }
    if (!mdView || !targetLeaf) {
      if (focus) {
        new Notice(
          "Open this deck's markdown file in a pane, then use \"Find in note\"."
        );
      }
      return;
    }
    const md = mdView.editor.getValue();
    const line = sourceLineForSlide(md, h, v, {
      autoH1Breaks: this.getSettings().autoH1Breaks,
    });
    const pos = { line, ch: 0 };
    // Mark this (h, v) as the synced position so the caret move below
    // doesn't bounce the preview back via the forward follow.
    this.lastSentSlideIdx = h;
    this.lastSyncedV = v;
    if (focus) this.app.workspace.revealLeaf(targetLeaf);
    mdView.editor.setCursor(pos);
    mdView.editor.scrollIntoView({ from: pos, to: pos }, focus);
    if (focus) mdView.editor.focus();
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
    this.debug?.log("view/refresh/enter", {
      hasIframe: !!this.iframeEl,
      filePath: this.filePath,
    });
    if (!this.iframeEl) {
      this.debug?.log("view/refresh/skip-no-iframe");
      return;
    }

    if (!this.filePath) {
      this.debug?.log("view/refresh/skip-no-filepath");
      this.showPlaceholder("Open a markdown file, then run \"Slides NG: open preview\".");
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) {
      this.debug?.log("view/refresh/file-not-found", { filePath: this.filePath });
      this.showPlaceholder(`File not found: ${this.filePath}`);
      return;
    }

    try {
      const markdown = await this.app.vault.read(file);
      const settings = this.getSettings();
      // v0.13.4: resolve image attachments to data: URIs. The preview
      // iframe is sandboxed with a null origin, which blocks `app://`
      // resource loads — so an `app://` <img> src silently fails to
      // load. data: URIs work in any origin. Cached by path|mtime.
      const resolveImage = await buildImageDataUriResolver(
        this.app,
        file,
        this.imageDataUriCache
      );
      const html = renderDeck(markdown, file.path, {
        defaultTheme: settings.defaultTheme,
        defaultTransition: settings.defaultTransition,
        defaultLayout: settings.defaultLayout,
        codeTheme: settings.codeTheme,
        imageLayoutSplit: settings.imageLayoutSplit,
        lineStepDimOpacity: settings.lineStepDimOpacity,
        showRevealControlsEmbedded: settings.showRevealControlsEmbedded,
        showRevealMenuEmbedded: settings.showRevealMenuEmbedded,
        clickToProgress: settings.clickToProgress,
        codeBlockMaxHeight: settings.codeBlockMaxHeight,
        codeBlockOverflowScroll: settings.codeBlockOverflowScroll,
        transitionSpeed: settings.transitionSpeed,
        magicMoveDurationMs: settings.magicMoveDurationMs,
        autoH1Breaks: settings.autoH1Breaks,
        sceneInheritThemeBg: settings.sceneInheritThemeBg,
        resolveImage,
      });
      // v0.10.8: queue the HTML as pending instead of setting srcdoc
      // immediately. `applyPendingIfReady()` consumes the pending
      // HTML once the iframe has non-zero dimensions. This way
      // multiple refresh() calls in quick succession (e.g. onOpen +
      // setState firing back-to-back) collapse into a single srcdoc
      // assignment with the latest HTML — Reveal then initialises
      // once, cleanly, into a real-sized viewport.
      this.pendingHtml = html;
      this.applyPendingIfReady();
      this.debug?.log("view/refresh/rendered", {
        filePath: this.filePath,
        htmlLength: html.length,
        iframeClientW: this.iframeEl.clientWidth,
        iframeClientH: this.iframeEl.clientHeight,
        applied: this.pendingHtml === null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.debug?.log("view/refresh/error", { error: msg });
      this.showPlaceholder(`Render error: ${msg}`);
      new Notice(`slides-ng render error: ${msg}`);
    }
  }

  /**
   * Apply `pendingHtml` to the iframe's srcdoc, but only if the
   * iframe is real-sized. Called from `refresh()` (after rendering
   * the HTML) and from the iframe's ResizeObserver (when the
   * iframe transitions to non-zero size). Idempotent — sets srcdoc
   * once and clears the pending field.
   */
  private applyPendingIfReady(): void {
    if (!this.iframeEl || this.pendingHtml === null) return;
    if (this.iframeEl.clientWidth === 0 || this.iframeEl.clientHeight === 0) {
      this.debug?.log("view/apply-pending/skip-zero-size");
      return;
    }
    const html = this.pendingHtml;
    this.pendingHtml = null;
    this.iframeEl.srcdoc = html;
    this.debug?.log("view/apply-pending/applied", {
      htmlLength: html.length,
      clientW: this.iframeEl.clientWidth,
      clientH: this.iframeEl.clientHeight,
    });
  }

  private showPlaceholder(message: string): void {
    if (!this.iframeEl) return;
    const safe = escapeHtml(message);
    // v0.11.51: HIGH-contrast empty-state placeholder. The previous
    // gray-on-dark-gray (color:#888;background:#111) was so subtle
    // the user kept reading it as a black-screen render failure.
    // Now: clear "Slides NG" branding so the user knows it\'s the
    // placeholder and not an unexpected blank pane.
    this.iframeEl.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
      html, body {
        margin: 0;
        height: 100%;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        background: #1e1e2e;
        color: #e8e8f0;
      }
      body {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 2rem;
        box-sizing: border-box;
      }
      .badge {
        font-size: 0.75rem;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: #8b8b9e;
        margin-bottom: 1rem;
      }
      .icon {
        font-size: 3rem;
        line-height: 1;
        margin-bottom: 1rem;
        opacity: 0.55;
      }
      .msg {
        font-size: 1.05rem;
        line-height: 1.5;
        max-width: 32rem;
        color: #e8e8f0;
      }
      .hint {
        margin-top: 1.5rem;
        font-size: 0.85rem;
        color: #9090a8;
        max-width: 28rem;
        line-height: 1.5;
      }
      kbd {
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 3px;
        padding: 1px 6px;
        font-family: ui-monospace, monospace;
        font-size: 0.85em;
      }
    </style></head><body>
      <div class="badge">Slides NG · preview</div>
      <div class="icon">▣</div>
      <div class="msg">${safe}</div>
      <div class="hint">Once a markdown file is open, click <kbd>Use current</kbd> or <kbd>Reload</kbd> in the toolbar above.</div>
    </body></html>`;
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
    const settings = this.getSettings();
    this.debug?.log("export/pdf/click", { filePath: file.path });
    new ExportPdfOptionsModal(
      this.app,
      settings.defaultTheme,
      (pdfOptions) => {
        if (!pdfOptions) {
          this.debug?.log("export/pdf/cancelled", {});
          return;
        }
        void this.runPdfExport(file, pdfOptions);
      },
      // v0.11.57: preview callback — modal calls this with the
      // currently-selected options after each change. We render
      // the deck through the export pipeline + return the HTML;
      // the modal pumps it into a sandboxed iframe.
      async (previewOptions, previewZoom) => {
        const markdown = await this.app.vault.read(file);
        const { renderDeckStandalone } = await import("./render/renderDeck");
        const merged: import("./render/renderDeck").RenderDefaults = {
          ...this.renderDefaults(),
        };
        // Mirror exportAndOpenForPdf's merging so the preview
        // matches what the export will produce.
        if (previewOptions.themeOverride) merged.defaultTheme = previewOptions.themeOverride;
        if (previewOptions.aspectRatio === "16:9") {
          merged.pdfAspectWidth = 1280;
          merged.pdfAspectHeight = 720;
        } else if (previewOptions.aspectRatio === "4:3") {
          merged.pdfAspectWidth = 1024;
          merged.pdfAspectHeight = 768;
        }
        merged.forcePrintMode = true;
        if (previewOptions.showNotes) merged.forceShowNotes = true;
        if (previewOptions.pdfStyle === "document") merged.forcePrintDocument = true;
        if (previewOptions.pdfStyle === "slides-notes") {
          merged.forceNotesEmphasis = true;
          merged.forceShowNotes = true;
          merged.forceMaxPagesPerSlide = 1;
        } else if (previewOptions.maxPagesPerSlide && previewOptions.maxPagesPerSlide > 1) {
          merged.forceMaxPagesPerSlide = previewOptions.maxPagesPerSlide;
        }
        if (previewOptions.autoShrink) merged.forceAutoShrink = true;
        if (previewOptions.pageSize && previewOptions.pageSize !== "current") {
          merged.forcePageSize = previewOptions.pageSize;
        }
        if (previewOptions.pageMargin) merged.forcePageMargin = previewOptions.pageMargin;
        if (previewOptions.grayscale) merged.forceGrayscale = true;
        if (previewOptions.hideBackgrounds) merged.forceHideBackgrounds = true;
        if (previewOptions.slideNumberStamp) merged.forceSlideNumberStamp = true;
        if (previewOptions.headerText) merged.forceHeaderText = previewOptions.headerText;
        if (previewOptions.footerText) merged.forceFooterText = previewOptions.footerText;
        const rendered = renderDeckStandalone(markdown, file.path, merged);
        // v0.11.58/v0.11.59: shrink the rendered HTML to fit the
        // preview iframe. CSS `zoom` shrinks the entire page
        // proportionally (Chromium-only; Obsidian is Electron→
        // Chromium, so safe). Zoom factor is user-controlled via
        // the modal slider (default 0.4 = one Letter page ≈ 330×425px,
        // visible cleanly in the 240px iframe + a peek of page 2).
        const PREVIEW_ZOOM = previewZoom ?? 0.4;
        const previewStyle =
          `<style id="slides-ng-preview-scale">html,body{zoom:${PREVIEW_ZOOM} !important;background:#fff !important;}` +
          `body{margin:0 !important;padding:0 !important;}` +
          `</style>`;
        // Inject just before </head>. Falls back to prepending the
        // style to body if no </head> is found (shouldn\'t happen).
        return rendered.includes("</head>")
          ? rendered.replace("</head>", `${previewStyle}</head>`)
          : previewStyle + rendered;
      },
      // v0.11.62: experimental live iframe preview, opt-in via Settings.
      settings.experimentalLivePdfPreview
    ).open();
  }

  /** Actually run the export once the user has picked their options. */
  private async runPdfExport(
    file: TFile,
    pdfOptions: PdfExportOptions
  ): Promise<void> {
    this.debug?.log("export/pdf/start", {
      filePath: file.path,
      pdfOptions,
    });
    try {
      // v0.11.43: log the exact URL we hand to the OS so we can
      // diagnose why print mode might not activate (URL malformed,
      // query stripped by Windows shell, encoded incorrectly, …).
      const { buildPdfUrlSuffix, pathToFileUrl } = await import(
        "./export/exportStandalone"
      );
      const result = await exportAndOpenForPdf(
        this.app,
        file,
        undefined,
        this.renderDefaults(),
        pdfOptions
      );
      const suffix = buildPdfUrlSuffix(pdfOptions);
      const finalUrl = pathToFileUrl(result.absolutePath) + suffix;
      this.debug?.log("export/pdf/result", {
        vaultRelativePath: result.vaultRelativePath,
        absolutePath: result.absolutePath,
        suffix,
        finalUrl,
        opened: result.opened,
        htmlLength: result.html.length,
        htmlContainsPrintCss: result.html.includes("html.print-pdf"),
        htmlContainsShowNotesClass: result.html.includes(
          "classList.add('show-notes')"
        ),
      });
      if (result.opened) {
        new Notice("Opened in print mode. Use your browser's print → save as PDF.");
      } else {
        new Notice(
          `Wrote ${result.vaultRelativePath} but could not auto-launch the browser. Open manually + append ?print-pdf to the URL.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.debug?.log("export/pdf/error", { error: msg });
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
      autoH1Breaks: s.autoH1Breaks,
      sceneInheritThemeBg: s.sceneInheritThemeBg,
      // v0.11.36: scenes for the standalone speaker-view popup. The
      // markdown content gets rendered to HTML at export time.
      scenes: s.scenes,
      // v0.11.41: PowerPoint-style click-to-advance flows through
      // to standalone exports too.
      clickToProgress: s.clickToProgress,
      // showRevealControlsEmbedded + showRevealMenuEmbedded intentionally
      // not threaded into standalone exports — standalone mode shows
      // controls + menu regardless.
    };
  }

}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
