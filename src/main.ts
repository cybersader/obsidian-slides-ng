import { Plugin, WorkspaceLeaf, Notice, TFile, MarkdownView } from "obsidian";
import { SlidesNGView, VIEW_TYPE_SLIDES_NG } from "./SlidesNGView";
import {
  SlidesNGSpeakerView,
  VIEW_TYPE_SLIDES_NG_SPEAKER,
} from "./SlidesNGSpeakerView";
import { warmHighlighter } from "./render/shiki";
import {
  exportAndOpen,
  exportAndOpenForPdf,
  type PdfExportOptions,
} from "./export/exportStandalone";
import { checkPdfExportContrast } from "./export/contrastCheck";
import { SlidesNGSettingTab } from "./SlidesNGSettingTab";
import { DEFAULT_SETTINGS, type SlidesNGSettings } from "./settings";
import { ExportPdfOptionsModal } from "./ExportPdfOptionsModal";
import { openSnippetInsertModal } from "./SnippetInsertModal";
import { DebugLog } from "./utils/debug";
import {
  LayoutNameSuggest,
  SlotMarkerSuggest,
  VClickSuggest,
} from "./SlidesNGSuggest";

export default class SlidesNGPlugin extends Plugin {
  settings: SlidesNGSettings = { ...DEFAULT_SETTINGS };
  /**
   * Most-recently-focused markdown file. Tracked via active-leaf-change
   * so the ribbon-button callback can still find the user's intended
   * deck even when the ribbon click has stolen focus away from the
   * markdown view between user intent and callback execution.
   */
  private lastMarkdownFile: TFile | null = null;
  /** File-based debug logger. Lifecycle events go here for diagnosis. */
  debug!: DebugLog;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.debug = new DebugLog(this.app, () => this.settings.debugLogging);
    this.debug.log("plugin/onload", {
      version: this.manifest.version,
      settings: {
        debugLogging: this.settings.debugLogging,
        defaultTheme: this.settings.defaultTheme,
        showRevealMenuEmbedded: this.settings.showRevealMenuEmbedded,
      },
    });
    this.addSettingTab(new SlidesNGSettingTab(this.app, this));

    this.registerView(
      VIEW_TYPE_SLIDES_NG,
      (leaf) => new SlidesNGView(
        leaf,
        () => this.settings,
        () => this.resolveActiveDeckFile(),
        this.debug
      )
    );

    // Track the user's most recently focused markdown file so the ribbon
    // button can still recover it after focus-steal. v0.10.1: seed both
    // immediately AND on layout-ready (some workspaces aren't fully
    // loaded when onload runs — getActiveViewOfType returns null in
    // that window), and listen on `file-open` as well as
    // `active-leaf-change` so it works for both tabs-with-files and
    // tab-switches.
    const seed = (): void => {
      const md = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (md?.file) this.lastMarkdownFile = md.file;
    };
    seed();
    this.app.workspace.onLayoutReady(seed);
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view instanceof MarkdownView && leaf.view.file) {
          this.lastMarkdownFile = leaf.view.file;
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file && file.extension === "md") {
          this.lastMarkdownFile = file;
        }
      })
    );

    this.registerView(
      VIEW_TYPE_SLIDES_NG_SPEAKER,
      (leaf) => new SlidesNGSpeakerView(
        leaf,
        () => this.settings,
        () => this.saveSettings()
      )
    );

    // In-editor autocomplete for deck authoring.
    this.registerEditorSuggest(new LayoutNameSuggest(this.app));
    // v0.13.0: pass a live getter so SlotMarkerSuggest picks the
    // right snippet expansion form (HTML default vs ::: shortcode)
    // based on the user\'s current setting.
    this.registerEditorSuggest(
      new SlotMarkerSuggest(this.app, () => this.settings.experimentalShortcodeSnippets)
    );
    this.registerEditorSuggest(new VClickSuggest(this.app));

    this.addRibbonIcon("presentation", "Open slides preview", () => {
      this.debug.log("ribbon/click");
      void this.activatePreviewLeaf();
    });

    this.addCommand({
      id: "clear-debug-log",
      name: "Clear debug log",
      callback: () => {
        void this.debug.clear().then(() =>
          new Notice("slides-ng debug log cleared.")
        );
      },
    });

    this.addCommand({
      id: "open-preview",
      name: "Open preview",
      callback: () => {
        void this.activatePreviewLeaf();
      },
    });

    this.addCommand({
      id: "open-in-browser",
      name: "Open in browser",
      callback: () => {
        void this.openActiveDeckInBrowser();
      },
    });

    this.addCommand({
      id: "export-for-pdf",
      name: "Export for PDF print",
      callback: () => {
        void this.openActiveDeckForPdf();
      },
    });

    this.addCommand({
      id: "open-speaker-view",
      name: "Open speaker view",
      callback: () => {
        void this.activateSpeakerLeaf();
      },
    });

    this.addCommand({
      id: "insert-html-snippet",
      name: "Insert HTML snippet",
      // v0.12.1: command-palette flow alongside the ::name autocomplete.
      // Selection-aware — if the user has text selected when they invoke,
      // the selection gets wrapped/encased in the snippet body. With no
      // selection it just drops the snippet at the caret like the
      // autocomplete does. v0.12.2: when experimentalSmartWrap is on,
      // also tries header-structure distribution for multi-slot snippets.
      editorCallback: () => {
        openSnippetInsertModal(
          this.app,
          this.settings.experimentalSmartWrap,
          this.settings.experimentalShortcodeSnippets
        );
      },
    });

    // Warm Shiki in the background so the first slide render has syntax
    // highlighting. Until this resolves, code blocks fall back to plain
    // escaped <pre><code> — the deck still renders, just without colours.
    void warmHighlighter().catch((err) => {
      console.warn("slides-ng: Shiki failed to warm", err);
    });
  }

  private async openActiveDeckInBrowser(): Promise<void> {
    const file = this.resolveDeckFile();
    if (!file) {
      new Notice("Open a Markdown deck before running this command.");
      return;
    }
    try {
      const result = await exportAndOpen(this.app, file, undefined, {
        defaultTheme: this.settings.defaultTheme,
        defaultTransition: this.settings.defaultTransition,
        scenes: this.settings.scenes,
      });
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

  private async openActiveDeckForPdf(): Promise<void> {
    const file = this.resolveDeckFile();
    if (!file) {
      new Notice("Open a Markdown deck before running this command.");
      return;
    }
    // Show options modal first; user picks notes/aspect/theme; null = cancel.
    new ExportPdfOptionsModal(
      this.app,
      this.settings.defaultTheme,
      (pdfOptions) => {
        if (!pdfOptions) return;
        void this.runPdfExport(file, pdfOptions);
      }
    ).open();
  }

  /** Actually run the export once the user has picked their options. */
  private async runPdfExport(
    file: TFile,
    pdfOptions: PdfExportOptions
  ): Promise<void> {
    // v0.11.73: deterministic contrast pre-check. If the chosen
    // theme + hideBackgrounds combo would print as low-contrast (or
    // identical) text-on-bg, surface a Notice before opening the
    // browser so the user can cancel + adjust. Pure-functional —
    // no DOM walk, no extra render.
    const contrastWarning = checkPdfExportContrast(
      pdfOptions,
      this.settings.defaultTheme
    );
    if (contrastWarning) {
      new Notice(contrastWarning.message, 10000);
      this.debug.log("export/pdf/contrast-warn", {
        ratio: contrastWarning.ratio,
        fg: contrastWarning.fg,
        bg: contrastWarning.bg,
        themeOverride: pdfOptions.themeOverride,
        hideBackgrounds: pdfOptions.hideBackgrounds,
      });
    }
    try {
      const result = await exportAndOpenForPdf(
        this.app,
        file,
        undefined,
        {
          defaultTheme: this.settings.defaultTheme,
          defaultTransition: this.settings.defaultTransition,
          scenes: this.settings.scenes,
        },
        pdfOptions
      );
      if (result.opened) {
        new Notice(
          "Opened in print mode. Use your browser's print → save as PDF."
        );
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

  /** Active markdown file, falling back to the preview view's loaded file. */
  private resolveDeckFile(): TFile | null {
    return this.resolveActiveDeckFile() ?? this.resolvePreviewedDeckFile();
  }

  async loadSettings(): Promise<void> {
    const stored = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
    // v0.11.15 migration: legacy "vertical" → "vertical-1".
    if (this.settings.speakerPickerOrientation === ("vertical" as unknown)) {
      this.settings.speakerPickerOrientation = "vertical-1";
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SLIDES_NG);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SLIDES_NG_SPEAKER);
  }

  private async activatePreviewLeaf(): Promise<void> {
    const { workspace } = this.app;
    const activeFile = this.resolveActiveDeckFile();
    const existing = workspace.getLeavesOfType(VIEW_TYPE_SLIDES_NG);
    this.debug.log("activatePreviewLeaf/enter", {
      activeFile,
      existingLeaves: existing.length,
      lastMarkdownFile: this.lastMarkdownFile,
    });

    if (existing.length > 0) {
      const leaf = existing[0];
      // Preserve the previously-loaded deck when the user re-opens preview
      // from the ribbon while focused on a non-markdown pane (e.g. the
      // preview itself). Only switch decks if there is an active markdown
      // file to switch to.
      const existingPath = (leaf.view instanceof SlidesNGView)
        ? leaf.view.getState()?.filePath
        : undefined;
      const filePath = activeFile?.path ?? existingPath;
      this.debug.log("activatePreviewLeaf/existing", { filePath });
      await leaf.setViewState({
        type: VIEW_TYPE_SLIDES_NG,
        active: true,
        state: { filePath },
      });
      workspace.revealLeaf(leaf);
      // v0.10.7: explicit focus. revealLeaf brings the leaf into view
      // (expands sidebar if needed) but doesn't necessarily focus it
      // in newer Obsidian — user reported "doesn't automatically go
      // to it like it used to." setActiveLeaf with focus:true gives
      // the leaf keyboard focus so navigation keys go to the deck.
      workspace.setActiveLeaf(leaf, { focus: true });
      return;
    }

    const leaf: WorkspaceLeaf | null = workspace.getRightLeaf(false);
    if (!leaf) {
      this.debug.log("activatePreviewLeaf/no-right-leaf");
      new Notice("Could not open a right-pane leaf.");
      return;
    }
    this.debug.log("activatePreviewLeaf/new-leaf", {
      filePath: activeFile?.path,
    });
    await leaf.setViewState({
      type: VIEW_TYPE_SLIDES_NG,
      active: true,
      state: { filePath: activeFile?.path },
    });
    workspace.revealLeaf(leaf);
    workspace.setActiveLeaf(leaf, { focus: true });
    this.debug.log("activatePreviewLeaf/exit");
  }

  private async activateSpeakerLeaf(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_SLIDES_NG_SPEAKER);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    // New tab in the current pane — doesn't take screen space until
    // explicitly switched to. User can drag the tab to a new window
    // for second-monitor use, or split manually if they want
    // simultaneous preview + speaker visibility.
    const leaf = workspace.getLeaf("tab");
    await leaf.setViewState({
      type: VIEW_TYPE_SLIDES_NG_SPEAKER,
      active: true,
    });
    workspace.revealLeaf(leaf);

    if (workspace.getLeavesOfType(VIEW_TYPE_SLIDES_NG).length === 0) {
      new Notice("Speaker view opened — open a slides preview to drive.");
    }
  }

  private resolveActiveDeckFile(): TFile | null {
    // Primary: currently active markdown view.
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.file) return view.file;
    // Fallback: ribbon-button clicks (and other UI that steals focus
    // before our callback fires) can leave the active-view check
    // returning null even though the user clearly intended a markdown
    // file. We track that file via active-leaf-change events for this
    // exact recovery path.
    return this.lastMarkdownFile;
  }

  /**
   * If a slides-ng preview view is open with a file loaded, return that
   * file. Lets the open-in-browser command work when the user is focused
   * on the preview pane itself (no markdown editor active).
   */
  private resolvePreviewedDeckFile(): TFile | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SLIDES_NG);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof SlidesNGView) {
        const path = view.getState()?.filePath;
        if (typeof path === "string") {
          const f = this.app.vault.getAbstractFileByPath(path);
          if (f instanceof TFile) return f;
        }
      }
    }
    return null;
  }
}
