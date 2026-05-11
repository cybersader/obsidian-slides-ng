import { ItemView, WorkspaceLeaf, TFile, Notice, ViewStateResult } from "obsidian";
import { renderDeck } from "./render/renderDeck";

export const VIEW_TYPE_SLIDES_NG = "slides-ng-preview";

interface SlidesNGViewState extends Record<string, unknown> {
  filePath?: string;
}

export class SlidesNGView extends ItemView {
  private filePath?: string;
  private iframeEl?: HTMLIFrameElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
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

    // Iframe
    this.iframeEl = container.createEl("iframe", {
      cls: "slides-ng-frame",
      attr: {
        sandbox: "allow-scripts",
      },
    });

    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.iframeEl = undefined;
    this.contentEl.empty();
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
      const html = renderDeck(markdown, file.path);
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
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
