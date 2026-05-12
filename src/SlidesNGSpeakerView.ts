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

import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { VIEW_TYPE_SLIDES_NG, SlidesNGView } from "./SlidesNGView";

export const VIEW_TYPE_SLIDES_NG_SPEAKER = "slides-ng-speaker";

interface PreviewState {
  currentIdx: number;
  fragmentIdx: number;
  totalSlides: number;
  isBlackout: boolean;
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
  | "requestState";

export class SlidesNGSpeakerView extends ItemView {
  private state: PreviewState | null = null;
  private timerStartMs: number | null = null;
  private timerPausedMs = 0;
  private timerTickHandle: number | null = null;
  private pickerMode: "compact" | "list" = "compact";

  // DOM refs populated in onOpen.
  private statusEl?: HTMLElement;
  private timerEl?: HTMLElement;
  private nextLineEl?: HTMLElement;
  private notesEl?: HTMLElement;
  private pickerEl?: HTMLElement;
  private blackoutBtn?: HTMLButtonElement;

  private messageHandler = (event: MessageEvent) => {
    const data = event.data as Partial<PreviewState> & { type?: string };
    if (!data || data.type !== "slides-ng-state") return;
    this.state = data as PreviewState;
    this.applyState();
  };

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
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
    const container = this.contentEl;
    container.empty();
    container.addClass("slides-ng-speaker");

    // Status bar
    const status = container.createDiv({ cls: "slides-ng-speaker-status" });
    this.statusEl = status.createSpan({ cls: "slides-ng-speaker-position", text: "Slide — of —" });
    this.timerEl = status.createSpan({ cls: "slides-ng-speaker-timer", text: "00:00:00" });

    // Control bar
    const controls = container.createDiv({ cls: "slides-ng-speaker-controls" });
    controls.createEl("button", { text: "First", cls: "slides-ng-speaker-btn" })
      .addEventListener("click", () => this.send("first"));
    controls.createEl("button", { text: "‹ prev", cls: "slides-ng-speaker-btn" })
      .addEventListener("click", () => this.send("prev"));
    controls.createEl("button", { text: "Next ›", cls: "slides-ng-speaker-btn" })
      .addEventListener("click", () => this.send("next"));
    controls.createEl("button", { text: "Last", cls: "slides-ng-speaker-btn" })
      .addEventListener("click", () => this.send("last"));
    this.blackoutBtn = controls.createEl("button", {
      text: "Blackout",
      cls: "slides-ng-speaker-btn slides-ng-speaker-blackout",
    });
    this.blackoutBtn.addEventListener("click", () => this.send("toggleBlackout"));

    // Timer controls
    const timerCtrls = container.createDiv({ cls: "slides-ng-speaker-timer-ctrls" });
    timerCtrls.createEl("button", { text: "Start/pause", cls: "slides-ng-speaker-btn" })
      .addEventListener("click", () => this.toggleTimer());
    timerCtrls.createEl("button", { text: "Reset", cls: "slides-ng-speaker-btn" })
      .addEventListener("click", () => this.resetTimer());

    // Next-slide preview line
    this.nextLineEl = container.createDiv({
      cls: "slides-ng-speaker-next",
      text: "Next: —",
    });

    // Notes panel
    const notesWrap = container.createDiv({ cls: "slides-ng-speaker-notes-wrap" });
    notesWrap.createEl("div", { cls: "slides-ng-speaker-section-title", text: "Speaker notes" });
    this.notesEl = notesWrap.createDiv({ cls: "slides-ng-speaker-notes" });

    // Picker mode toggle
    const pickerHeader = container.createDiv({ cls: "slides-ng-speaker-picker-header" });
    pickerHeader.createEl("div", { cls: "slides-ng-speaker-section-title", text: "Slides" });
    const modeToggle = pickerHeader.createEl("button", {
      cls: "slides-ng-speaker-btn slides-ng-speaker-mode-toggle",
      text: "Mode: compact",
    });
    modeToggle.addEventListener("click", () => {
      this.pickerMode = this.pickerMode === "compact" ? "list" : "compact";
      modeToggle.setText(`Mode: ${this.pickerMode}`);
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
    this.contentEl.empty();
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
      this.blackoutBtn.setText(this.state.isBlackout ? "Blackout on" : "Blackout");
    }
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
  }

  private resetTimer(): void {
    this.timerStartMs = null;
    this.timerPausedMs = 0;
    this.stopTimerTick();
    if (this.timerEl) this.timerEl.setText("00:00:00");
  }

  private startTimerTick(): void {
    this.stopTimerTick();
    this.timerTickHandle = window.setInterval(() => this.applyTimerLabel(), 500);
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
