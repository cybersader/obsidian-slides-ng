import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { SlidesNGView, VIEW_TYPE_SLIDES_NG } from "./SlidesNGView";

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
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SLIDES_NG);
  }

  private async activatePreviewLeaf(): Promise<void> {
    const { workspace } = this.app;

    const existing = workspace.getLeavesOfType(VIEW_TYPE_SLIDES_NG);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf: WorkspaceLeaf | null = workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("Could not open a right-pane leaf.");
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE_SLIDES_NG, active: true });
    workspace.revealLeaf(leaf);
  }
}
