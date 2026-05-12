/**
 * In-Obsidian Speaker Console.
 *
 * Companion to `SlidesNGView`. Communicates with the preview iframe via
 * postMessage:
 *
 *   parent → iframe   `{ type:"slides-ng-cmd", cmd, idx? }`
 *   iframe → parent   `{ type:"slides-ng-state", currentIdx, totalSlides,
 *                        isBlackout, notesHtml, nextTitle, slides }`
 *
 * The view shows: status bar (slide N / M, elapsed timer, blackout +
 * picker-mode toggles), nav controls, speaker notes, and a slide
 * picker (compact or full-list). Drag the leaf to a new window via
 * Obsidian's "Move to new window" to make it a true second monitor.
 */

import {
  ItemView,
  WorkspaceLeaf,
  Notice,
  setIcon,
  setTooltip,
  TFile,
  TAbstractFile,
} from "obsidian";
import { Marked } from "marked";
import { VIEW_TYPE_SLIDES_NG, SlidesNGView } from "./SlidesNGView";
import { renderDeck } from "./render/renderDeck";
import type { SlidesNGSettings, SceneDefinition } from "./settings";

// Lightweight markdown → HTML for scene content. Synchronous + fast +
// no Obsidian-render-cycle hang risk. Scenes are presentational
// overlays; we don't need wikilinks/embeds/Obsidian-specific bits.
const sceneMd = new Marked();

export const VIEW_TYPE_SLIDES_NG_SPEAKER = "slides-ng-speaker";

interface PreviewState {
  currentIdx: number;
  fragmentIdx: number;
  totalSlides: number;
  isBlackout: boolean;
  /** Currently-active scene id, or null if none. Added in v0.7.0. */
  activeSceneId: string | null;
  notesHtml: string;
  nextTitle: string;
  slides: { idx: number; title: string }[];
}

type SpeakerCommand =
  | "next"
  | "prev"
  | "first"
  | "last"
  | "goto"
  | "toggleBlackout"
  | "toggleOverview"
  | "toggleMenu"
  | "setScene"
  | "clearScene"
  | "requestState";

export type SpeakerSettingsAccessor = () => SlidesNGSettings;

export class SlidesNGSpeakerView extends ItemView {
  private state: PreviewState | null = null;
  private timerStartMs: number | null = null;
  private timerPausedMs = 0;
  private timerTickHandle: number | null = null;
  private pickerMode: "compact" | "list" = "compact";
  private getSettings?: SpeakerSettingsAccessor;

  // DOM refs populated in onOpen.
  private statusEl?: HTMLElement;
  private timerEl?: HTMLElement;
  private timerToggleBtn?: HTMLButtonElement;
  private nextLineEl?: HTMLElement;
  private notesEl?: HTMLElement;
  private pickerEl?: HTMLElement;
  private blackoutBtn?: HTMLButtonElement;
  private modeToggleBtn?: HTMLButtonElement;
  private sceneButtons = new Map<string, HTMLButtonElement>();
  /** Visual next-slide preview mini-iframe (v0.7.0). */
  private nextSlideIframe?: HTMLIFrameElement;
  /** Cached deck path the mini-iframe is currently rendering. */
  private lastMiniRenderedPath?: string;
  /** Cached deck mtime so save-driven re-renders stay in sync. */
  private lastMiniRenderedMtime?: number;

  private messageHandler = (event: MessageEvent) => {
    const data = event.data as Partial<PreviewState> & { type?: string };
    if (!data || data.type !== "slides-ng-state") return;
    // Only accept state from the MAIN preview iframe. The visual next-
    // slide mini-iframe (introduced in v0.7) also runs the bridge and
    // posts state events — those represent a different slide position
    // and would race the main preview's state, clobbering activeSceneId
    // and other fields. event.source identifies which iframe sent the
    // message.
    const mainIframe = this.findPreviewIframe();
    if (mainIframe && event.source && event.source !== mainIframe.contentWindow) {
      return;
    }
    this.state = data as PreviewState;
    this.applyState();
  };

  constructor(leaf: WorkspaceLeaf, getSettings?: SpeakerSettingsAccessor) {
    super(leaf);
    this.getSettings = getSettings;
  }

  getViewType(): string {
    return VIEW_TYPE_SLIDES_NG_SPEAKER;
  }

  getDisplayText(): string {
    return "Slides speaker";
  }

  getIcon(): string {
    return "presentation";
  }

  async onOpen(): Promise<void> {
    // Resolve initial picker mode from settings (if available).
    const settings = this.getSettings?.();
    if (settings?.speakerPickerDefaultMode) {
      this.pickerMode = settings.speakerPickerDefaultMode;
    }

    const container = this.contentEl;
    container.empty();
    container.addClass("slides-ng-speaker");

    // Status bar
    const status = container.createDiv({ cls: "slides-ng-speaker-status" });
    this.statusEl = status.createSpan({ cls: "slides-ng-speaker-position", text: "Slide — of —" });
    this.timerEl = status.createSpan({ cls: "slides-ng-speaker-timer", text: "00:00:00" });

    // Control bar — connected nav pill + utility buttons
    const controls = container.createDiv({ cls: "slides-ng-speaker-controls" });
    const navGroup = controls.createDiv({ cls: "slides-ng-speaker-nav-group" });
    this.addControlButton(navGroup, {
      icon: "chevrons-left",
      label: "First",
      tooltip: "Jump to first slide",
      onClick: () => this.send("first"),
    });
    this.addControlButton(navGroup, {
      icon: "chevron-left",
      label: "Prev",
      tooltip: "Previous slide",
      onClick: () => this.send("prev"),
    });
    this.addControlButton(navGroup, {
      icon: "chevron-right",
      label: "Next",
      tooltip: "Next slide",
      variant: "primary",
      onClick: () => this.send("next"),
    });
    this.addControlButton(navGroup, {
      icon: "chevrons-right",
      label: "Last",
      tooltip: "Jump to last slide",
      onClick: () => this.send("last"),
    });

    const utilGroup = controls.createDiv({ cls: "slides-ng-speaker-util-group" });
    this.addControlButton(utilGroup, {
      icon: "grid-3x3",
      label: "Grid",
      tooltip: "Toggle the slide-grid overview",
      onClick: () => this.send("toggleOverview"),
    });
    this.blackoutBtn = this.addControlButton(utilGroup, {
      icon: "monitor-off",
      label: "Blackout",
      tooltip: "Blackout the slide window",
      onClick: () => this.send("toggleBlackout"),
      extraClass: "slides-ng-speaker-blackout",
    });

    // Timer controls
    const timerCtrls = container.createDiv({ cls: "slides-ng-speaker-timer-ctrls" });
    this.timerToggleBtn = this.addControlButton(timerCtrls, {
      icon: "play",
      label: "Start",
      tooltip: "Start the elapsed timer",
      onClick: () => this.toggleTimer(),
    });
    this.addControlButton(timerCtrls, {
      icon: "rotate-ccw",
      label: "Reset",
      tooltip: "Reset the elapsed timer to zero",
      onClick: () => this.resetTimer(),
    });

    // Next-slide preview line (text)
    this.nextLineEl = container.createDiv({
      cls: "slides-ng-speaker-next",
      text: "Next: —",
    });

    // Visual next-slide preview — a second iframe rendering the same
    // deck pinned to currentIdx + 1. Synced via postMessage on every
    // slidechanged event from the main preview.
    const visualWrap = container.createDiv({
      cls: "slides-ng-speaker-visual-next-wrap",
    });
    visualWrap.createEl("div", {
      cls: "slides-ng-speaker-section-title",
      text: "Up next (visual)",
    });
    const frameWrap = visualWrap.createDiv({
      cls: "slides-ng-speaker-visual-next-frame-wrap",
    });
    this.nextSlideIframe = frameWrap.createEl("iframe", {
      cls: "slides-ng-speaker-visual-next-frame",
      attr: { sandbox: "allow-scripts" },
    });

    // Re-render the mini-iframe whenever the deck file is modified.
    this.registerEvent(
      this.app.vault.on("modify", (file: TAbstractFile) => {
        if (this.lastMiniRenderedPath && file.path === this.lastMiniRenderedPath) {
          // Force re-render by clearing cache markers.
          this.lastMiniRenderedPath = undefined;
          this.lastMiniRenderedMtime = undefined;
          void this.ensureVisualNextSlideRendered();
        }
      })
    );

    // Scenes panel — placeholder overlays the presenter can flash up
    // mid-presentation (blackout, BRB, Q&A, custom). One button per
    // configured scene; active scene gets the accent treatment.
    this.renderScenesPanel(container);

    // Notes panel
    const notesWrap = container.createDiv({ cls: "slides-ng-speaker-notes-wrap" });
    notesWrap.createEl("div", { cls: "slides-ng-speaker-section-title", text: "Speaker notes" });
    this.notesEl = notesWrap.createDiv({ cls: "slides-ng-speaker-notes" });

    // Picker mode toggle
    const pickerHeader = container.createDiv({ cls: "slides-ng-speaker-picker-header" });
    pickerHeader.createEl("div", { cls: "slides-ng-speaker-section-title", text: "Slides" });
    this.modeToggleBtn = pickerHeader.createEl("button", {
      cls: "slides-ng-speaker-btn slides-ng-speaker-mode-toggle",
      text: `Mode: ${this.pickerMode}`,
    });
    this.modeToggleBtn.addEventListener("click", () => {
      this.pickerMode = this.pickerMode === "compact" ? "list" : "compact";
      this.modeToggleBtn!.setText(`Mode: ${this.pickerMode}`);
      this.renderPicker();
    });

    // Slide picker
    this.pickerEl = container.createDiv({ cls: "slides-ng-speaker-picker" });

    // Wire postMessage listener for state from the preview iframe.
    window.addEventListener("message", this.messageHandler);

    // Ask the preview for its current state (handles the case where this
    // view opens AFTER the preview has already rendered).
    this.send("requestState");
  }

  async onClose(): Promise<void> {
    window.removeEventListener("message", this.messageHandler);
    this.stopTimerTick();
    this.sceneButtons.clear();
    this.contentEl.empty();
  }

  /**
   * Build a speaker-view button with an icon + label. Mirrors the
   * preview toolbar's pattern (`addToolbarButton` in SlidesNGView) so
   * the two surfaces feel consistent.
   */
  private addControlButton(
    parent: HTMLElement,
    opts: {
      icon: string;
      label: string;
      tooltip?: string;
      variant?: "primary";
      extraClass?: string;
      onClick: () => void;
    }
  ): HTMLButtonElement {
    const cls = [
      "slides-ng-speaker-btn",
      opts.variant === "primary" ? "mod-cta" : "",
      opts.extraClass ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    const btn = parent.createEl("button", { cls });
    const iconEl = btn.createSpan({ cls: "slides-ng-speaker-btn-icon" });
    setIcon(iconEl, opts.icon);
    btn.createSpan({ cls: "slides-ng-speaker-btn-label", text: opts.label });
    if (opts.tooltip) setTooltip(btn, opts.tooltip);
    btn.addEventListener("click", opts.onClick);
    return btn;
  }

  /** Replace the icon inside a control button created by addControlButton. */
  private swapButtonIcon(btn: HTMLElement | undefined, icon: string): void {
    if (!btn) return;
    const iconEl = btn.querySelector(".slides-ng-speaker-btn-icon") as HTMLElement | null;
    if (iconEl) setIcon(iconEl, icon);
  }

  /** Replace the label inside a control button created by addControlButton. */
  private swapButtonLabel(btn: HTMLElement | undefined, label: string): void {
    if (!btn) return;
    const labelEl = btn.querySelector(".slides-ng-speaker-btn-label") as HTMLElement | null;
    if (labelEl) labelEl.setText(label);
  }

  /**
   * Render the Scenes panel — one button per configured scene. Clicking
   * a scene postMessages `setScene` (or `clearScene` if already active)
   * to the preview iframe, which overlays the scene content on top of
   * the current slide. State events echo back the active scene id so
   * the buttons stay in sync.
   */
  private renderScenesPanel(container: HTMLElement): void {
    const scenes: SceneDefinition[] = this.getSettings?.()?.scenes ?? [];
    if (scenes.length === 0) return;

    const wrap = container.createDiv({ cls: "slides-ng-speaker-scenes-wrap" });
    wrap.createEl("div", {
      cls: "slides-ng-speaker-section-title",
      text: "Scenes",
    });
    const sceneRow = wrap.createDiv({ cls: "slides-ng-speaker-scenes" });
    this.sceneButtons.clear();
    for (const scene of scenes) {
      // Icon lookup: a few well-known scene ids get a dedicated icon;
      // anything else gets a generic "layers" icon.
      const icon = scene.id === "blackout"
        ? "monitor-off"
        : scene.id === "brb"
          ? "coffee"
          : scene.id === "qa"
            ? "message-circle-question"
            : scene.id === "standby"
              ? "pause-circle"
              : "layers";
      const btn = this.addControlButton(sceneRow, {
        icon,
        label: scene.label,
        tooltip: `Show scene: ${scene.label}`,
        onClick: () => this.activateScene(scene),
      });
      this.sceneButtons.set(scene.id, btn);
    }
  }

  /**
   * Toggle a scene on or off. If this scene is already active, clear
   * it; otherwise render the scene's markdown content to HTML and
   * send it to the iframe via the `setScene` bridge command.
   */
  private activateScene(scene: SceneDefinition): void {
    const isActive = this.state?.activeSceneId === scene.id;
    if (isActive) {
      this.send("clearScene");
      return;
    }
    const html = this.renderSceneMarkdown(scene.content);
    this.sendPayload({
      type: "slides-ng-cmd",
      cmd: "setScene",
      id: scene.id,
      html,
    });
  }

  /**
   * Render scene markdown to HTML via the same sync `marked` we use
   * for deck content. Scenes are presentational overlays — we don't
   * need wikilink/embed resolution. Empty content (blackout case)
   * returns empty string; the overlay's default black background IS
   * the blackout effect.
   */
  private renderSceneMarkdown(content: string): string {
    if (!content || content.trim().length === 0) return "";
    return sceneMd.parse(content, { async: false }) as string;
  }

  /**
   * Find the file path the main preview is showing, by reading its
   * leaf state. Used by the visual next-slide preview to know which
   * deck to render in its mini-iframe.
   */
  private findPreviewDeckPath(): string | undefined {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SLIDES_NG);
    for (const leaf of leaves) {
      if (leaf.view instanceof SlidesNGView) {
        const path = leaf.view.getState()?.filePath;
        if (typeof path === "string") return path;
      }
    }
    return undefined;
  }

  /**
   * Ensure the mini-iframe is rendering the current deck. Re-renders
   * when the deck path changes OR when the file's mtime changes
   * (post-save). No-op when already up-to-date.
   */
  private async ensureVisualNextSlideRendered(): Promise<void> {
    if (!this.nextSlideIframe) return;
    const deckPath = this.findPreviewDeckPath();
    if (!deckPath) return;
    const file = this.app.vault.getAbstractFileByPath(deckPath);
    if (!(file instanceof TFile)) return;
    const mtime = file.stat.mtime;
    if (
      deckPath === this.lastMiniRenderedPath &&
      mtime === this.lastMiniRenderedMtime
    ) {
      return;
    }
    try {
      const markdown = await this.app.vault.read(file);
      const settings = this.getSettings?.();
      const html = renderDeck(markdown, file.path, {
        defaultTheme: settings?.defaultTheme,
        defaultTransition: settings?.defaultTransition,
        defaultLayout: settings?.defaultLayout,
        codeTheme: settings?.codeTheme,
        imageLayoutSplit: settings?.imageLayoutSplit,
        lineStepDimOpacity: settings?.lineStepDimOpacity,
        codeBlockMaxHeight: settings?.codeBlockMaxHeight,
        codeBlockOverflowScroll: settings?.codeBlockOverflowScroll,
        transitionSpeed: settings?.transitionSpeed,
        magicMoveDurationMs: settings?.magicMoveDurationMs,
        // The mini-iframe is a preview, not interactive — controls + menu off.
        showRevealControlsEmbedded: false,
        showRevealMenuEmbedded: false,
        resolveImage: (raw) => this.resolveDeckImage(raw, file.path),
      });
      this.nextSlideIframe.srcdoc = html;
      this.lastMiniRenderedPath = deckPath;
      this.lastMiniRenderedMtime = mtime;
    } catch (err) {
      console.warn("[slides-ng] visual next-slide preview render failed", err);
    }
  }

  /** Drive the mini-iframe to a specific slide index (clamped to total). */
  private driveVisualNextSlideTo(idx: number): void {
    if (!this.nextSlideIframe?.contentWindow) return;
    const safeIdx = Math.max(0, idx);
    this.nextSlideIframe.contentWindow.postMessage(
      { type: "slides-ng-cmd", cmd: "goto", idx: safeIdx },
      "*"
    );
  }

  /** Image-attachment resolver — mirrors SlidesNGView.resolveImageAttachment. */
  private resolveDeckImage(raw: string, deckPath: string): string | null {
    if (/^(https?:|data:|file:)/.test(raw)) return raw;
    const trimmed = raw.trim();
    const linktext = trimmed.replace(/^!?\[\[|\]\]$/g, "");
    const target = this.app.metadataCache.getFirstLinkpathDest(linktext, deckPath);
    if (target) return this.app.vault.adapter.getResourcePath(target.path);
    const file = this.app.vault.getAbstractFileByPath(trimmed);
    if (file && "path" in file) return this.app.vault.adapter.getResourcePath(file.path);
    return null;
  }

  /** Lower-level postMessage helper for commands with payloads beyond {cmd, idx?}. */
  private sendPayload(payload: Record<string, unknown>): void {
    const iframe = this.findPreviewIframe();
    if (!iframe || !iframe.contentWindow) {
      new Notice("Open a slides-ng preview first.");
      return;
    }
    iframe.contentWindow.postMessage(payload, "*");
  }

  // --- Preview-iframe communication ---

  private findPreviewIframe(): HTMLIFrameElement | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SLIDES_NG);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof SlidesNGView) {
        const iframe = view.containerEl.querySelector(
          "iframe.slides-ng-frame"
        ) as HTMLIFrameElement | null;
        if (iframe) return iframe;
      }
    }
    return null;
  }

  private send(cmd: SpeakerCommand, idx?: number): void {
    const iframe = this.findPreviewIframe();
    if (!iframe || !iframe.contentWindow) {
      new Notice("Open a slides-ng preview first.");
      return;
    }
    iframe.contentWindow.postMessage({ type: "slides-ng-cmd", cmd, idx }, "*");
  }

  // --- State application ---

  private applyState(): void {
    if (!this.state) return;
    if (this.statusEl) {
      this.statusEl.setText(
        `Slide ${this.state.currentIdx + 1} of ${this.state.totalSlides}`
      );
    }
    if (this.nextLineEl) {
      this.nextLineEl.setText(
        this.state.nextTitle ? `Next: ${this.state.nextTitle}` : "Next: (end)"
      );
    }
    if (this.notesEl) {
      this.notesEl.innerHTML = this.state.notesHtml || "<em>No notes</em>";
    }
    if (this.blackoutBtn) {
      this.blackoutBtn.toggleClass("on", this.state.isBlackout);
      this.swapButtonLabel(
        this.blackoutBtn,
        this.state.isBlackout ? "Blackout on" : "Blackout"
      );
    }
    // Highlight whichever scene is currently active; clear the others.
    const activeId = this.state.activeSceneId;
    for (const [id, btn] of this.sceneButtons) {
      btn.toggleClass("on", id === activeId);
    }

    // Drive the visual next-slide preview to currentIdx + 1.
    void this.ensureVisualNextSlideRendered().then(() => {
      this.driveVisualNextSlideTo(this.state!.currentIdx + 1);
    });
    this.renderPicker();
  }

  private renderPicker(): void {
    if (!this.pickerEl || !this.state) return;
    this.pickerEl.empty();
    const { slides, currentIdx } = this.state;
    if (this.pickerMode === "compact") {
      const summary = this.pickerEl.createDiv({ cls: "slides-ng-speaker-compact" });
      const cur = slides[currentIdx];
      summary.createEl("div", {
        text: cur ? `▶ ${cur.idx + 1}. ${cur.title || "(untitled)"}` : "—",
        cls: "slides-ng-speaker-compact-current",
      });
      const after = slides.slice(currentIdx + 1, currentIdx + 4);
      for (const s of after) {
        summary.createEl("div", {
          text: `  ${s.idx + 1}. ${s.title || "(untitled)"}`,
          cls: "slides-ng-speaker-compact-upcoming",
        });
      }
    } else {
      for (const s of slides) {
        const item = this.pickerEl.createDiv({
          cls:
            "slides-ng-speaker-list-item" +
            (s.idx === currentIdx ? " current" : ""),
          text: `${s.idx + 1}. ${s.title || "(untitled)"}`,
        });
        item.addEventListener("click", () => this.send("goto", s.idx));
      }
    }
  }

  // --- Timer ---

  private toggleTimer(): void {
    if (this.timerStartMs === null) {
      // First start (or after reset)
      this.timerStartMs = Date.now() - this.timerPausedMs;
      this.timerPausedMs = 0;
      this.startTimerTick();
    } else {
      // Pause: capture elapsed, freeze
      this.timerPausedMs = Date.now() - this.timerStartMs;
      this.timerStartMs = null;
      this.stopTimerTick();
      this.applyTimerLabel();
    }
    this.applyTimerBtnState();
  }

  private resetTimer(): void {
    this.timerStartMs = null;
    this.timerPausedMs = 0;
    this.stopTimerTick();
    if (this.timerEl) this.timerEl.setText("00:00:00");
    this.applyTimerBtnState();
  }

  private applyTimerBtnState(): void {
    if (!this.timerToggleBtn) return;
    const running = this.timerStartMs !== null;
    this.swapButtonIcon(this.timerToggleBtn, running ? "pause" : "play");
    this.swapButtonLabel(this.timerToggleBtn, running ? "Pause" : "Start");
    this.timerToggleBtn.toggleClass("mod-cta", running);
  }

  private startTimerTick(): void {
    this.stopTimerTick();
    const tickMs = this.getSettings?.()?.speakerTimerTickMs ?? 1000;
    this.timerTickHandle = window.setInterval(() => this.applyTimerLabel(), tickMs);
    this.applyTimerLabel();
  }

  private stopTimerTick(): void {
    if (this.timerTickHandle !== null) {
      window.clearInterval(this.timerTickHandle);
      this.timerTickHandle = null;
    }
  }

  private applyTimerLabel(): void {
    if (!this.timerEl) return;
    const ms =
      this.timerStartMs === null ? this.timerPausedMs : Date.now() - this.timerStartMs;
    this.timerEl.setText(formatMs(ms));
  }
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(
    2,
    "0"
  )}`;
}
