import { ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_SLIDES_NG = "slides-ng-preview";

export class SlidesNGView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_SLIDES_NG;
  }

  getDisplayText(): string {
    return "Slides preview";
  }

  getIcon(): string {
    return "presentation";
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("slides-ng-view");

    const placeholder = container.createDiv({ cls: "slides-ng-placeholder" });
    placeholder.createEl("h3", { text: "Slides preview" });
    placeholder.createEl("p", {
      text: "Preview pane is wired up. Deck rendering ships next.",
    });
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }
}
