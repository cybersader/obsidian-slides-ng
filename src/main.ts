import { Plugin, WorkspaceLeaf, Notice, TFile, MarkdownView } from "obsidian";
import { SlidesNGView, VIEW_TYPE_SLIDES_NG } from "./SlidesNGView";
import { warmHighlighter } from "./render/shiki";
import { exportAndOpen } from "./export/exportStandalone";

export default class SlidesNGPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE_SLIDES_NG, (leaf) => new SlidesNGView(leaf));

    this.addRibbonIcon("presentation", "Open slides preview", () => {
      void this.activatePreviewLeaf();
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

    // Warm Shiki in the background so the first slide render has syntax
    // highlighting. Until this resolves, code blocks fall back to plain
    // escaped <pre><code> — the deck still renders, just without colours.
    void warmHighlighter().catch((err) => {
      console.warn("slides-ng: Shiki failed to warm", err);
    });
  }

  private async openActiveDeckInBrowser(): Promise<void> {
    // Try the active markdown editor first; if not present (e.g. the
    // slides-ng preview itself is focused), fall back to whatever deck
    // the existing preview view is showing.
    let file = this.resolveActiveDeckFile();
    if (!file) file = this.resolvePreviewedDeckFile();
    if (!file) {
      new Notice("Open a markdown deck before running this command.");
      return;
    }
    try {
      const result = await exportAndOpen(this.app, file);
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

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SLIDES_NG);
  }

  private async activatePreviewLeaf(): Promise<void> {
    const { workspace } = this.app;
    const activeFile = this.resolveActiveDeckFile();

    const existing = workspace.getLeavesOfType(VIEW_TYPE_SLIDES_NG);
    if (existing.length > 0) {
      const leaf = existing[0];
      await leaf.setViewState({
        type: VIEW_TYPE_SLIDES_NG,
        active: true,
        state: { filePath: activeFile?.path },
      });
      workspace.revealLeaf(leaf);
      return;
    }

    const leaf: WorkspaceLeaf | null = workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("Could not open a right-pane leaf.");
      return;
    }
    await leaf.setViewState({
      type: VIEW_TYPE_SLIDES_NG,
      active: true,
      state: { filePath: activeFile?.path },
    });
    workspace.revealLeaf(leaf);
  }

  private resolveActiveDeckFile(): TFile | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.file ?? null;
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
