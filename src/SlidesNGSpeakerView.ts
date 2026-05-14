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
import { readSlideNotes, replaceSlideNotes } from "./parser/editSlideNotes";
import type {
  SlidesNGSettings,
  SceneDefinition,
  SpeakerPanelId,
} from "./settings";
import {
  DEFAULT_SPEAKER_PANEL_VISIBILITY,
  DEFAULT_SPEAKER_PANEL_ORDER,
  PICKER_TILE_PRESETS,
} from "./settings";
import { peekFrontmatterRaw } from "./parser/parseDeck";

// Lightweight markdown → HTML for scene content. Synchronous + fast +
// no Obsidian-render-cycle hang risk. Scenes are presentational
// overlays; we don't need wikilinks/embeds/Obsidian-specific bits.
// `breaks: true` honours single `\n` as <br/> so multi-line scene
// content (the BRB / Q&A defaults) renders with the line breaks the
// deck author wrote.
const sceneMd = new Marked({ breaks: true, gfm: true });

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
  /**
   * v0.11.15: panel ids the current slide has flagged for hiding
   * via `slides-ng-hide-panels:` frontmatter. The speaker view
   * temporarily hides matching panels while this slide is current
   * and restores them when navigating to a slide without the
   * override.
   */
  hidePanels?: string[];
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
export type SpeakerSettingsPersist = () => Promise<void>;

/** v0.11.15: canonical orientation values (excludes the legacy "vertical" alias). */
type PickerOrientation = "vertical-1" | "vertical-2" | "horizontal" | "auto";

export class SlidesNGSpeakerView extends ItemView {
  private state: PreviewState | null = null;
  private timerStartMs: number | null = null;
  private timerPausedMs = 0;
  private timerTickHandle: number | null = null;
  private getSettings?: SpeakerSettingsAccessor;

  // DOM refs populated in onOpen.
  private statusEl?: HTMLElement;
  private timerEl?: HTMLElement;
  private timerToggleBtn?: HTMLButtonElement;
  private notesEl?: HTMLElement;
  private pickerEl?: HTMLElement;
  /** Thumbnail-picker iframe (v0.11.0). Renders the deck and is
   * switched into strip mode via the `enablePickerStrip` bridge
   * command. Click events come back as `slides-ng-picker` messages
   * which we forward as `goto` commands to the main preview. */
  private pickerStripIframe?: HTMLIFrameElement;
  /** Path / mtime cache for the picker iframe — same pattern as
   * the visual-next-slide iframe, so save-driven re-renders are
   * cheap and idempotent. */
  private lastPickerRenderedPath?: string;
  private lastPickerRenderedMtime?: number;
  /** Orientation toggle button in the picker header (v0.11.0). */
  private pickerOrientationBtn?: HTMLButtonElement;
  /** Magnifier-cycle button in the picker header (v0.11.17). */
  private pickerSizeBtn?: HTMLButtonElement;
  /**
   * v0.11.21: pending setPickerCurrent burst timers. The burst posts
   * the same idx at t=0 + several follow-ups to defeat bridge-install
   * races on fresh mounts. If a new state event arrives mid-burst, the
   * previous burst's stale posts would overwrite the new highlight
   * (the v0.11.20 flicker bug). Tracking them lets us cancel before
   * scheduling the next burst.
   */
  private pickerCurrentBurstTimers: number[] = [];
  /**
   * v0.11.24: pending driveVisualNextSlideTo burst timers. Same
   * flicker class as the picker — rapid navigation left stale goto
   * posts in flight that landed on the up-next iframe after a newer
   * navigation already updated it. Tracking + cancelling on each
   * fresh call eliminates the flip-back.
   */
  private visualNextBurstTimers: number[] = [];
  /**
   * Per-deck override read from `slides-ng-picker-tile-width` in
   * frontmatter; cached so we don't re-peek on every tile re-render.
   * `undefined` = no override, fall back to settings; `0` = explicit
   * "auto" override. v0.11.17.
   */
  private deckPickerTileWidth: number | undefined;
  private sceneButtons = new Map<string, HTMLButtonElement>();
  /** Visual next-slide preview mini-iframe (v0.7.0). */
  private nextSlideIframe?: HTMLIFrameElement;
  /** Cached deck path the mini-iframe is currently rendering. */
  private lastMiniRenderedPath?: string;
  /** Cached deck mtime so save-driven re-renders stay in sync. */
  private lastMiniRenderedMtime?: number;

  private messageHandler = (event: MessageEvent) => {
    const data = event.data as Partial<PreviewState> & {
      type?: string;
      event?: string;
      idx?: number;
    };
    if (!data) return;
    // v0.11.14: bridge-ready signal from any iframe. When the picker
    // iframe's bridge attaches, re-post enablePickerStrip +
    // setPickerCurrent — defeats the race where all retries of the
    // burst could miss before the listener installed (caused picker
    // to stay in default reveal-render mode).
    if (data.type === "slides-ng-bridge-ready") {
      const pickerWin = this.pickerStripIframe?.contentWindow;
      if (pickerWin && event.source === pickerWin) {
        const s = this.getSettings?.();
        this.postToPicker({
          type: "slides-ng-cmd",
          cmd: "enablePickerStrip",
          orientation: this.normalizeOrientation(s?.speakerPickerOrientation),
          tileWidth: this.effectiveTileWidth(),
          currentIdx: this.state?.currentIdx ?? 0,
        });
        if (typeof this.state?.currentIdx === "number") {
          this.postToPicker({
            type: "slides-ng-cmd",
            cmd: "setPickerCurrent",
            idx: this.state.currentIdx,
          });
        }
      }
      return;
    }
    // v0.11.0: picker-strip iframe sends `slides-ng-picker` events
    // when the user clicks a thumbnail. Forward as `goto` to the
    // MAIN preview iframe so the deck navigates there.
    if (data.type === "slides-ng-picker" && data.event === "click") {
      if (typeof data.idx === "number") {
        this.send("goto", data.idx);
      }
      return;
    }
    if (data.type !== "slides-ng-state") return;
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
    const prev = this.state;
    this.state = data as PreviewState;
    // Lap-mode timer: reset on every slide change (only the
    // horizontal-slide index, not initial state arrival).
    if (
      this.getSettings?.()?.speakerTimerMode === "lap" &&
      prev !== null &&
      typeof prev.currentIdx === "number" &&
      prev.currentIdx !== this.state.currentIdx
    ) {
      this.lapResetTimer();
    }
    this.lastSeenSlideIdx = this.state.currentIdx ?? null;
    this.applyState();
  };

  private saveSettings?: SpeakerSettingsPersist;
  private resizeObserver?: ResizeObserver;
  private notesWrapEl?: HTMLElement;
  private notesEditing = false;
  /** Most recently observed slide index — for lap-mode timer reset on slide change. */
  private lastSeenSlideIdx: number | null = null;
  /** Drop-position indicator line (DnD). Shows where the dragged panel will land. */
  private dropIndicatorEl?: HTMLElement;
  /** True = drop ABOVE the current hover target; false = drop BELOW. */
  private dropAbove = true;
  private dropTargetEl?: HTMLElement;
  /** Panel id currently being dragged. `null` when no drag is in flight. v0.10.1+. */
  private draggingPanelId: SpeakerPanelId | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    getSettings?: SpeakerSettingsAccessor,
    saveSettings?: SpeakerSettingsPersist
  ) {
    super(leaf);
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
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
    // v0.10.3: picker rebuild — single scrollable list, no mode
    // toggle; `speakerPickerDefaultMode` setting is now ignored and
    // will be removed entirely in a future release.
    const settings = this.getSettings?.();

    const container = this.contentEl;
    container.empty();
    container.addClass("slides-ng-speaker");
    // Apply the multi-column class if the user wants 2-col flow at wide
    // widths. CSS does the actual layout via a container-query.
    container.toggleClass(
      "slides-ng-speaker-multicolumn",
      settings?.speakerPanelsMultiColumn !== false
    );

    // Panel visibility: each panel is shown only if its visibility flag
    // is true. Hidden panels are still mounted (display:none) so
    // toggling is instant.
    const visibility: Record<SpeakerPanelId, boolean> = {
      ...DEFAULT_SPEAKER_PANEL_VISIBILITY,
      ...(settings?.speakerPanelVisibility ?? {}),
    };
    const setPanelVisible = (el: HTMLElement, id: SpeakerPanelId): void => {
      el.dataset.speakerPanel = id;
      el.style.display = visibility[id] ? "" : "none";
      el.classList.add("slides-ng-speaker-panel");
      // Drag handles are attached AFTER all panel content is built
      // (via `attachAllDragHandles` at the end of onOpen) so we can
      // detect each panel's title and place the handle inline next
      // to it.
    };

    // Status bar — clickable as a whole to open the Grid (slide N of M
    // acts like a "jump to any slide" affordance). Timer display moved
    // out into its own panel in v0.10.0 so this is now just position.
    const status = container.createDiv({ cls: "slides-ng-speaker-status" });
    setPanelVisible(status, "status");
    const statusBtn = status.createEl("button", {
      cls: "slides-ng-speaker-status-btn",
      attr: { type: "button" },
    });
    setTooltip(statusBtn, "Open the slide grid");
    this.statusEl = statusBtn.createSpan({ cls: "slides-ng-speaker-position", text: "Slide — of —" });
    statusBtn.addEventListener("click", () => this.send("toggleOverview"));

    // Control bar — connected nav pill + utility buttons
    const controls = container.createDiv({ cls: "slides-ng-speaker-controls" });
    setPanelVisible(controls, "controls");
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

    // v0.10.0: Grid moved out of speaker controls and into the preview
    // toolbar (where Menu / Use current already live). The status bar
    // is still clickable as a shortcut.

    // Timer panel — self-contained: big display + mode dropdown +
    // Start/Reset buttons. v0.10.0+. Replaces the v0.8.x split where
    // the timer DISPLAY lived in the status bar and the BUTTONS lived
    // in a separate slim row.
    const timerPanel = container.createDiv({ cls: "slides-ng-speaker-timer-panel" });
    setPanelVisible(timerPanel, "timer");
    timerPanel.createEl("div", {
      cls: "slides-ng-speaker-section-title",
      text: "Timer",
    });
    this.timerEl = timerPanel.createEl("div", {
      cls: "slides-ng-speaker-timer-display",
      text: "00:00:00",
    });
    const timerRow = timerPanel.createDiv({
      cls: "slides-ng-speaker-timer-row",
    });
    const modeSelect = timerRow.createEl("select", {
      cls: "dropdown slides-ng-speaker-timer-mode",
      attr: { "aria-label": "Timer mode" },
    });
    const modes: Array<{ value: SlidesNGSettings["speakerTimerMode"]; label: string }> = [
      { value: "elapsed", label: "Elapsed" },
      { value: "countdown", label: "Countdown" },
      { value: "lap", label: "Slide (lap)" },
    ];
    for (const m of modes) {
      const opt = modeSelect.createEl("option", { value: m.value, text: m.label });
      if ((this.getSettings?.()?.speakerTimerMode ?? "elapsed") === m.value) {
        opt.selected = true;
      }
    }
    // v0.10.3: inline countdown-target input. Visible only when the
    // timer mode is "countdown" — hidden otherwise to keep the row
    // tidy. Live-edit the target without bouncing to settings.
    const countdownInput = timerRow.createEl("input", {
      cls: "slides-ng-speaker-timer-countdown",
      attr: {
        type: "number",
        min: "1",
        max: "600",
        step: "1",
        "aria-label": "Countdown target (minutes)",
      },
    });
    countdownInput.value = String(
      this.getSettings?.()?.speakerTimerCountdownMinutes ?? 30
    );
    setTooltip(countdownInput, "Countdown target (minutes)");
    const minutesLabel = timerRow.createSpan({
      cls: "slides-ng-speaker-timer-countdown-label",
      text: "min",
    });
    const syncCountdownVisibility = (): void => {
      const isCountdown =
        (this.getSettings?.()?.speakerTimerMode ?? "elapsed") === "countdown";
      countdownInput.style.display = isCountdown ? "" : "none";
      minutesLabel.style.display = isCountdown ? "" : "none";
    };
    syncCountdownVisibility();
    countdownInput.addEventListener("input", () => {
      const n = parseFloat(countdownInput.value);
      if (!Number.isFinite(n) || n <= 0 || n > 600) return;
      const s = this.getSettings?.();
      if (!s) return;
      s.speakerTimerCountdownMinutes = n;
      void this.saveSettings?.();
      this.applyTimerLabel();
    });

    modeSelect.addEventListener("change", () => {
      const s = this.getSettings?.();
      if (!s) return;
      s.speakerTimerMode = modeSelect.value as SlidesNGSettings["speakerTimerMode"];
      void this.saveSettings?.();
      syncCountdownVisibility();
      this.resetTimer();
    });
    setTooltip(
      modeSelect,
      "Elapsed counts up; Countdown counts down from the configured minutes; Lap resets per slide"
    );
    this.timerToggleBtn = this.addControlButton(timerRow, {
      icon: "play",
      label: "Start",
      tooltip: "Start the timer",
      onClick: () => this.toggleTimer(),
    });
    this.addControlButton(timerRow, {
      icon: "rotate-ccw",
      label: "Reset",
      tooltip: "Reset the timer to zero",
      onClick: () => this.resetTimer(),
    });

    // v0.10.3: the "Next: …" text line was deleted in favour of
    // the rebuilt picker (which shows the next slides inline) +
    // the visual next-slide preview iframe below. The `nextLine`
    // panel id is still recognised in settings for back-compat
    // but the panel itself is no longer mounted.

    // Visual next-slide preview — a second iframe rendering the same
    // deck pinned to currentIdx + 1. Synced via postMessage on every
    // slidechanged event from the main preview.
    const visualWrap = container.createDiv({
      cls: "slides-ng-speaker-visual-next-wrap",
    });
    setPanelVisible(visualWrap, "visualNext");
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
    this.renderScenesPanel(container, setPanelVisible);

    // Notes panel — read-only HTML rendering by default, with an Edit
    // button that swaps in a textarea + Save/Cancel. Save writes the
    // edited markdown back to the deck file via replaceSlideNotes.
    const notesWrap = container.createDiv({ cls: "slides-ng-speaker-notes-wrap" });
    setPanelVisible(notesWrap, "notes");
    const notesHeader = notesWrap.createDiv({ cls: "slides-ng-speaker-notes-header" });
    notesHeader.createEl("div", {
      cls: "slides-ng-speaker-section-title",
      text: "Speaker notes",
    });
    const editBtn = notesHeader.createEl("button", {
      cls: "slides-ng-speaker-btn slides-ng-speaker-notes-edit",
      attr: { type: "button" },
    });
    const editIcon = editBtn.createSpan({ cls: "slides-ng-speaker-btn-icon" });
    setIcon(editIcon, "pencil");
    editBtn.createSpan({ cls: "slides-ng-speaker-btn-label", text: "Edit" });
    setTooltip(editBtn, "Edit the current slide's speaker notes");
    editBtn.addEventListener("click", () => this.enterNotesEditMode());
    this.notesEl = notesWrap.createDiv({ cls: "slides-ng-speaker-notes" });
    this.notesWrapEl = notesWrap;

    // Picker — header + content. v0.11.0: two styles —
    //   "thumbnails": iframe rendered in picker-strip mode (PowerPoint-like)
    //   "text":       v0.10.3 scrollable column of numbered text rows
    // Toggleable via the orientation button in the header AND via
    // settings. Either way, only one is mounted at a time.
    const pickerWrap = container.createDiv({ cls: "slides-ng-speaker-picker-wrap" });
    setPanelVisible(pickerWrap, "picker");
    const pickerHeader = pickerWrap.createDiv({ cls: "slides-ng-speaker-picker-header" });
    pickerHeader.createEl("div", { cls: "slides-ng-speaker-section-title", text: "Slides" });

    const pickerStyle = settings?.speakerPickerStyle ?? "thumbnails";
    if (pickerStyle === "thumbnails") {
      // Orientation toggle button: rotate-3d-2d-like icon. Click
      // flips vertical ⇄ horizontal and persists the setting.
      this.pickerOrientationBtn = pickerHeader.createEl("button", {
        cls: "slides-ng-speaker-btn slides-ng-speaker-picker-orient-btn",
        attr: { type: "button" },
      });
      const initialOrient = this.normalizeOrientation(
        settings?.speakerPickerOrientation
      );
      this.applyPickerOrientButton(initialOrient);
      this.pickerOrientationBtn.addEventListener("click", () => {
        const s = this.getSettings?.();
        if (!s) return;
        // v0.11.15: cycle 1-col → 2-col → horizontal → auto → 1-col.
        const cycle: Array<PickerOrientation> = [
          "vertical-1",
          "vertical-2",
          "horizontal",
          "auto",
        ];
        const current = this.normalizeOrientation(s.speakerPickerOrientation);
        const idx = cycle.indexOf(current);
        const next = cycle[(idx + 1) % cycle.length];
        s.speakerPickerOrientation = next;
        void this.saveSettings?.();
        this.applyPickerOrientButton(next);
        this.postToPicker({
          type: "slides-ng-cmd",
          cmd: "setPickerOrientation",
          orientation: next,
        });
      });

      // v0.11.17: magnifier-cycle button. Cycles tile size between
      // 3 presets (compact / comfortable / big). Auto (the install
      // default) is not part of the cycle — once you click in, you
      // stay on a named preset. The Settings tab still accepts any
      // positive integer or 0 (auto) for power users; per-deck
      // `slides-ng-picker-tile-width` overrides both.
      this.pickerSizeBtn = pickerHeader.createEl("button", {
        cls: "slides-ng-speaker-btn slides-ng-speaker-picker-size-btn",
        attr: { type: "button" },
      });
      this.applyPickerSizeButton(
        this.resolvePickerTileSizePreset(settings?.speakerPickerTileWidth ?? 0)
      );
      this.pickerSizeBtn.addEventListener("click", () => {
        const s = this.getSettings?.();
        if (!s) return;
        const cycle: Array<keyof typeof PICKER_TILE_PRESETS> = [
          "compact",
          "comfortable",
          "big",
        ];
        const current = this.resolvePickerTileSizePreset(s.speakerPickerTileWidth ?? 0);
        // If user is on 'auto' or a custom value, START at compact.
        const startIdx = current === "auto" || current === "custom"
          ? -1
          : cycle.indexOf(current);
        const next = cycle[(startIdx + 1) % cycle.length];
        s.speakerPickerTileWidth = PICKER_TILE_PRESETS[next];
        void this.saveSettings?.();
        this.applyPickerSizeButton(next);
        // Re-issue enablePickerStrip so buildPickerStrip rebuilds
        // tiles with the new tile-width attribute. The iframe's
        // buildPickerStrip helper clears the existing strip first
        // so this is a clean reset (no orphan tiles).
        this.postToPicker({
          type: "slides-ng-cmd",
          cmd: "enablePickerStrip",
          orientation: this.normalizeOrientation(s.speakerPickerOrientation),
          tileWidth: this.effectiveTileWidth(),
          currentIdx: this.state?.currentIdx ?? 0,
        });
      });

      this.pickerEl = pickerWrap.createDiv({ cls: "slides-ng-speaker-picker slides-ng-speaker-picker-thumbs" });
      this.pickerStripIframe = this.pickerEl.createEl("iframe", {
        cls: "slides-ng-speaker-picker-iframe",
        attr: { sandbox: "allow-scripts" },
      });
      // Re-render when the deck file changes (matches visual-next pattern).
      this.registerEvent(
        this.app.vault.on("modify", (file: TAbstractFile) => {
          if (this.lastPickerRenderedPath && file.path === this.lastPickerRenderedPath) {
            this.lastPickerRenderedPath = undefined;
            this.lastPickerRenderedMtime = undefined;
            void this.ensurePickerStripRendered();
          }
        })
      );
    } else {
      // Legacy text-list picker.
      this.pickerEl = pickerWrap.createDiv({ cls: "slides-ng-speaker-picker" });
    }

    // Visual-next-preview height: apply the user's persisted height
    // if any, and wire a ResizeObserver to persist subsequent drag-
    // resizes. The frame-wrap is `resize: vertical` in styles.css.
    if (frameWrap) {
      if (settings?.speakerVisualNextHeightPx) {
        frameWrap.style.paddingTop = "0";
        frameWrap.style.height = `${settings.speakerVisualNextHeightPx}px`;
      }
      // Debounced persist on user-drag.
      let saveTimer: number | null = null;
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const height = Math.round(entry.contentRect.height);
        // Ignore the initial measurement (no user interaction yet).
        const liveSettings = this.getSettings?.();
        if (!liveSettings) return;
        if (liveSettings.speakerVisualNextHeightPx === height) return;
        // Switch off aspect-ratio padding once user touches the handle.
        frameWrap.style.paddingTop = "0";
        if (saveTimer !== null) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          saveTimer = null;
          liveSettings.speakerVisualNextHeightPx = height;
          void this.saveSettings?.();
        }, 250);
      });
      this.resizeObserver.observe(frameWrap);
    }

    // Apply the user's configured panel order. Panels are still
    // created in source-code order above; reordering happens here
    // by appending them in the configured sequence (the DOM moves
    // the existing nodes — no re-creation).
    this.applyPanelOrder();

    // Attach drag handles AFTER all panels are built so we can find
    // each panel's section title (where present) and place the handle
    // inline next to it. Panels without a title get a top-left
    // floating handle instead.
    this.attachAllDragHandles();
    // v0.11.15: render the "Show all panels" affordance if any are hidden.
    this.updateShowAllPanelsButton();

    // Wire postMessage listener for state from the preview iframe.
    window.addEventListener("message", this.messageHandler);

    // Ask the preview for its current state (handles the case where this
    // view opens AFTER the preview has already rendered).
    this.send("requestState");
  }

  /**
   * Reorder the speaker panels in the DOM to match the user's
   * `speakerPanelOrder` setting. Panels missing from the setting fall
   * back to their default position (which makes settings forward-
   * compatible across plugin updates that add new panels).
   */
  private applyPanelOrder(): void {
    const container = this.contentEl;
    const panels = new Map<SpeakerPanelId, HTMLElement>();
    container.querySelectorAll<HTMLElement>("[data-speaker-panel]").forEach((el) => {
      const id = el.dataset.speakerPanel as SpeakerPanelId | undefined;
      if (id) panels.set(id, el);
    });
    const configured = this.getSettings?.()?.speakerPanelOrder ?? [];
    // De-dupe + filter to known panels.
    const seen = new Set<SpeakerPanelId>();
    const order: SpeakerPanelId[] = [];
    for (const id of configured) {
      if (panels.has(id) && !seen.has(id)) {
        seen.add(id);
        order.push(id);
      }
    }
    // Append any default-order panels not in the configured list, in
    // their default position. Forward-compat for new panels.
    for (const id of DEFAULT_SPEAKER_PANEL_ORDER) {
      if (panels.has(id) && !seen.has(id)) {
        seen.add(id);
        order.push(id);
      }
    }
    for (const id of order) {
      const el = panels.get(id);
      if (el) container.appendChild(el);
    }
  }

  /** Attach handles for every panel currently in the DOM. */
  private attachAllDragHandles(): void {
    const panels = this.contentEl.querySelectorAll<HTMLElement>(
      "[data-speaker-panel]"
    );
    panels.forEach((panel) => {
      const id = panel.dataset.speakerPanel as SpeakerPanelId | undefined;
      if (id) this.attachDragHandle(panel, id);
    });
  }

  /**
   * Attach a drag handle to a panel + wire HTML5 DnD. The handle is
   * placed INLINE next to the panel's section title (when present);
   * otherwise floats at top-left. Only the handle is draggable; the
   * rest of the panel stays interactive. v0.8.3+: floating drop-line
   * indicator at the exact drop position.
   */
  private attachDragHandle(panel: HTMLElement, id: SpeakerPanelId): void {
    panel.classList.add("slides-ng-speaker-panel");
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "slides-ng-speaker-panel-handle";
    handle.title = "Drag to reorder this panel";
    handle.draggable = true;
    setIcon(handle, "grip-vertical");

    // v0.11.15: inline hide button — sibling to the drag handle.
    // Click to hide this panel for the session (persists in settings).
    // Restore via the "Show all panels" button in the speaker-view
    // top right OR by reopening the Settings → Speaker Panels.
    const hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.className = "slides-ng-speaker-panel-hide";
    hideBtn.title = "Hide this panel";
    setIcon(hideBtn, "eye-off");
    hideBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const s = this.getSettings?.();
      if (!s) return;
      s.speakerPanelVisibility = {
        ...s.speakerPanelVisibility,
        [id]: false,
      };
      void this.saveSettings?.();
      panel.style.display = "none";
      // Re-render the show-all button visibility check.
      this.updateShowAllPanelsButton();
    });
    handle.addEventListener("dragstart", (e) => {
      if (!e.dataTransfer) return;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/x-slides-ng-panel", id);
      // Track the id locally too — HTML5 DnD forbids reading
      // dataTransfer.getData() during dragover (only during drop),
      // and we need to know what's being dragged in dragover to
      // suppress no-op drop indicators.
      this.draggingPanelId = id;
      panel.classList.add("dragging");
      this.contentEl.classList.add("slides-ng-speaker-dragging");
    });
    handle.addEventListener("dragend", () => {
      panel.classList.remove("dragging");
      this.contentEl.classList.remove("slides-ng-speaker-dragging");
      this.draggingPanelId = null;
      this.hideDropIndicator();
    });
    panel.addEventListener("dragover", (e) => {
      const dt = e.dataTransfer;
      if (!dt) return;
      if (!dt.types.includes("text/x-slides-ng-panel")) return;
      e.preventDefault();
      dt.dropEffect = "move";
      this.updateDropIndicator(panel, id, e.clientY);
    });
    panel.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (!dt) return;
      const draggedId = dt.getData("text/x-slides-ng-panel") as SpeakerPanelId;
      if (!draggedId || draggedId === id) {
        this.hideDropIndicator();
        return;
      }
      e.preventDefault();
      // Resolve drop position from the indicator state. Computed during
      // dragover; default to "above" if for some reason the indicator
      // wasn't updated (shouldn't happen but defensive).
      const dropAbove = this.dropAbove;
      this.hideDropIndicator();
      const settings = this.getSettings?.();
      if (!settings) return;
      const current: SpeakerPanelId[] =
        settings.speakerPanelOrder && settings.speakerPanelOrder.length > 0
          ? [...settings.speakerPanelOrder]
          : [...DEFAULT_SPEAKER_PANEL_ORDER];
      const filtered = current.filter((p) => p !== draggedId);
      const targetPos = filtered.indexOf(id);
      if (targetPos === -1) {
        filtered.push(draggedId);
      } else {
        const insertAt = dropAbove ? targetPos : targetPos + 1;
        filtered.splice(insertAt, 0, draggedId);
      }
      for (const known of DEFAULT_SPEAKER_PANEL_ORDER) {
        if (!filtered.includes(known)) filtered.push(known);
      }
      settings.speakerPanelOrder = filtered;
      void this.saveSettings?.();
      this.applyPanelOrder();
    });
    // Placement (v0.10.0 rewrite):
    //   - If the section title sits inside an existing `*-header` div
    //     (notesHeader, pickerHeader — both already row-flex), insert
    //     the handle BEFORE the title in that header.
    //   - If the section title is a direct child of the panel (visualNext,
    //     scenes, picker without header), wrap the title in a NEW
    //     `panel-header` sub-div and put the handle next to it. This
    //     avoids mutating the panel's own flex-direction (which used to
    //     accidentally center the panel's other children horizontally).
    //   - Title-less panels (status, controls, timer, nextLine) get a
    //     floating handle at top-left.
    const title = panel.querySelector<HTMLElement>(
      ":scope > .slides-ng-speaker-section-title, " +
        ":scope > [class*='-header'] > .slides-ng-speaker-section-title"
    );
    // v0.11.16: layout rewrite — drag handle + hide button live in
    // a "panel-controls" group on the RIGHT side of the title row,
    // freeing left space for the title text. Previously they were
    // on the left, awkwardly pushing the title rightward. The new
    // group also coexists with any trailing action button the
    // panel already had (Edit on notes, orientation toggle on
    // picker) — both end up on the right, with the controls group
    // closer to the title.
    const controls = document.createElement("div");
    controls.className = "slides-ng-speaker-panel-controls";
    controls.appendChild(handle);
    controls.appendChild(hideBtn);

    if (!title) {
      // Title-less panels (status, controls, timer): float the
      // controls group at the TOP-RIGHT of the panel.
      controls.classList.add("slides-ng-speaker-panel-controls--floating");
      panel.insertBefore(controls, panel.firstChild);
      return;
    }
    const titleParent = title.parentElement;
    const titleParentIsHeader =
      !!titleParent && /-header\b/.test(titleParent.className);
    if (titleParentIsHeader && titleParent) {
      // Existing header with an action button already on the right
      // (notesHeader → Edit; pickerHeader → orientation toggle).
      // Insert the controls AFTER the title, BEFORE the action
      // button — so the action stays rightmost and the controls
      // sit between title and action.
      const actionBtn = titleParent.querySelector<HTMLElement>(
        "button:not(.slides-ng-speaker-panel-handle):not(.slides-ng-speaker-panel-hide)"
      );
      if (actionBtn) {
        titleParent.insertBefore(controls, actionBtn);
      } else {
        titleParent.appendChild(controls);
      }
    } else if (titleParent) {
      // No existing header — wrap the title in a new header div
      // with the controls group on its right.
      const header = document.createElement("div");
      header.className = "slides-ng-speaker-panel-header";
      titleParent.insertBefore(header, title);
      header.appendChild(title);
      header.appendChild(controls);
    } else {
      panel.insertBefore(controls, panel.firstChild);
    }
  }

  /**
   * v0.11.15: apply the current slide's per-slide hide-panels
   * override. Hides panels whose ids appear in `hideList`; restores
   * the user's persisted visibility for any others that may have
   * been hidden by a previous slide's override. Doesn't mutate
   * `settings.speakerPanelVisibility` — purely DOM-level.
   */
  private applyPerSlideHidePanels(hideList: string[]): void {
    const settings = this.getSettings?.();
    if (!settings) return;
    const hideSet = new Set(hideList);
    const persistent = settings.speakerPanelVisibility ?? {};
    this.contentEl
      .querySelectorAll<HTMLElement>("[data-speaker-panel]")
      .forEach((panel) => {
        const id = panel.dataset.speakerPanel as SpeakerPanelId | undefined;
        if (!id) return;
        const persistentlyVisible = persistent[id] !== false;
        const slideHidden = hideSet.has(id);
        // Visible iff persistent setting allows AND not slide-hidden.
        panel.style.display =
          persistentlyVisible && !slideHidden ? "" : "none";
      });
  }

  /**
   * v0.11.15: render the "show all panels" button in the speaker
   * view's top-right area only when at least one panel is hidden.
   * Idempotent — creates the button if missing, removes when no
   * panels are hidden, or just updates visibility.
   */
  private updateShowAllPanelsButton(): void {
    const s = this.getSettings?.();
    if (!s) return;
    const visibility = s.speakerPanelVisibility ?? {};
    const anyHidden = Object.values(visibility).some((v) => v === false);
    let btn = this.contentEl.querySelector<HTMLButtonElement>(
      ".slides-ng-speaker-show-all-panels"
    );
    if (!anyHidden) {
      btn?.remove();
      return;
    }
    if (!btn) {
      btn = document.createElement("button");
      btn.className = "slides-ng-speaker-btn slides-ng-speaker-show-all-panels";
      btn.type = "button";
      setTooltip(btn, "Show all hidden panels");
      const iconEl = btn.createSpan({ cls: "slides-ng-speaker-btn-icon" });
      setIcon(iconEl, "eye");
      btn.createSpan({ cls: "slides-ng-speaker-btn-label", text: "Show all" });
      btn.addEventListener("click", () => {
        const settings = this.getSettings?.();
        if (!settings) return;
        for (const id of Object.keys(settings.speakerPanelVisibility ?? {})) {
          settings.speakerPanelVisibility[id as SpeakerPanelId] = true;
        }
        void this.saveSettings?.();
        // Un-hide every panel inline.
        this.contentEl
          .querySelectorAll<HTMLElement>("[data-speaker-panel]")
          .forEach((p) => {
            p.style.display = "";
          });
        this.updateShowAllPanelsButton();
      });
      // Insert as the first child of contentEl so it floats at top.
      this.contentEl.insertBefore(btn, this.contentEl.firstChild);
    }
  }

  /**
   * Lazily create the floating drop-indicator line. One per speaker
   * view; positioned absolutely inside the container so we can move
   * it during dragover without re-layout.
   */
  private ensureDropIndicator(): HTMLElement {
    if (this.dropIndicatorEl && this.dropIndicatorEl.isConnected) {
      return this.dropIndicatorEl;
    }
    const ind = document.createElement("div");
    ind.className = "slides-ng-speaker-drop-indicator";
    this.contentEl.appendChild(ind);
    this.dropIndicatorEl = ind;
    return ind;
  }

  /**
   * Position the drop-indicator line at the top OR bottom of the
   * hovered panel, depending on which half of the panel the cursor
   * is in. Standard reorder-DnD UX: drop above if hovering top
   * half, below if bottom half.
   *
   * v0.10.1: suppress the indicator entirely when the drop would
   * be a no-op — i.e. dropping the panel back into the slot it
   * currently occupies. Specifically:
   *   - hovering the dragged panel itself (always no-op)
   *   - hovering ABOVE the panel that comes right AFTER the
   *     dragged one (drop would put it right back where it was)
   *   - hovering BELOW the panel that comes right BEFORE the
   *     dragged one (same)
   */
  private updateDropIndicator(
    target: HTMLElement,
    targetId: SpeakerPanelId,
    cursorY: number
  ): void {
    const rect = target.getBoundingClientRect();
    const containerRect = this.contentEl.getBoundingClientRect();
    const middle = rect.top + rect.height / 2;
    const isAbove = cursorY < middle;
    this.dropAbove = isAbove;
    this.dropTargetEl = target;

    // No-op suppression. Compute the current panel order and see
    // whether this hover position would actually change anything.
    const draggingId = this.draggingPanelId;
    if (draggingId) {
      if (targetId === draggingId) {
        this.hideDropIndicator();
        return;
      }
      const settings = this.getSettings?.();
      const order: SpeakerPanelId[] =
        settings?.speakerPanelOrder && settings.speakerPanelOrder.length > 0
          ? [...settings.speakerPanelOrder]
          : [...DEFAULT_SPEAKER_PANEL_ORDER];
      const draggedAt = order.indexOf(draggingId);
      const targetAt = order.indexOf(targetId);
      if (draggedAt !== -1 && targetAt !== -1) {
        // dragged comes RIGHT BEFORE target + hovering top half = no-op
        if (isAbove && targetAt === draggedAt + 1) {
          this.hideDropIndicator();
          return;
        }
        // dragged comes RIGHT AFTER target + hovering bottom half = no-op
        if (!isAbove && targetAt === draggedAt - 1) {
          this.hideDropIndicator();
          return;
        }
      }
    }

    const ind = this.ensureDropIndicator();
    ind.style.display = "block";
    ind.style.width = `${rect.width}px`;

    // v0.11.6: position the indicator at the MIDPOINT of the gap
    // between the hovered panel and its neighbour on the chosen
    // side. Previously the indicator drew at the target panel's
    // top OR bottom edge — with a 6 px gap between panels, that
    // gave two different positions depending on which panel was
    // hovered ("indicator jumps between top of one panel and
    // bottom of another"). Midpoint positioning means the same
    // visual line whether the user crosses the gap upward or
    // downward.
    const scrollTop = this.contentEl.scrollTop || 0;
    const scrollLeft = this.contentEl.scrollLeft || 0;
    const neighbour = isAbove
      ? this.previousVisiblePanel(target)
      : this.nextVisiblePanel(target);
    let boundaryViewportY: number;
    if (neighbour) {
      const nRect = neighbour.getBoundingClientRect();
      boundaryViewportY = isAbove
        ? (nRect.bottom + rect.top) / 2
        : (rect.bottom + nRect.top) / 2;
    } else {
      // Edge of the panel list (no neighbour above the first or
      // below the last). Fall back to the panel's own edge.
      boundaryViewportY = isAbove ? rect.top : rect.bottom;
    }
    ind.style.top = `${boundaryViewportY - containerRect.top + scrollTop - 1}px`;
    ind.style.left = `${rect.left - containerRect.left + scrollLeft}px`;
  }

  /** Walk the DOM siblings to find the next visible speaker panel. */
  private nextVisiblePanel(from: HTMLElement): HTMLElement | null {
    let n = from.nextElementSibling as HTMLElement | null;
    while (n) {
      if (
        n.classList.contains("slides-ng-speaker-panel") &&
        n.style.display !== "none"
      ) {
        return n;
      }
      n = n.nextElementSibling as HTMLElement | null;
    }
    return null;
  }

  /** Walk the DOM siblings to find the previous visible speaker panel. */
  private previousVisiblePanel(from: HTMLElement): HTMLElement | null {
    let n = from.previousElementSibling as HTMLElement | null;
    while (n) {
      if (
        n.classList.contains("slides-ng-speaker-panel") &&
        n.style.display !== "none"
      ) {
        return n;
      }
      n = n.previousElementSibling as HTMLElement | null;
    }
    return null;
  }

  private hideDropIndicator(): void {
    if (this.dropIndicatorEl) {
      this.dropIndicatorEl.style.display = "none";
    }
    this.dropTargetEl = undefined;
  }

  async onClose(): Promise<void> {
    window.removeEventListener("message", this.messageHandler);
    this.stopTimerTick();
    this.sceneButtons.clear();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }
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
  private renderScenesPanel(
    container: HTMLElement,
    setPanelVisible: (el: HTMLElement, id: SpeakerPanelId) => void
  ): void {
    const scenes: SceneDefinition[] = this.getSettings?.()?.scenes ?? [];
    if (scenes.length === 0) return;

    const wrap = container.createDiv({ cls: "slides-ng-speaker-scenes-wrap" });
    setPanelVisible(wrap, "scenes");
    wrap.createEl("div", {
      cls: "slides-ng-speaker-section-title",
      text: "Scenes",
    });
    const sceneRow = wrap.createDiv({ cls: "slides-ng-speaker-scenes" });
    this.sceneButtons.clear();
    for (const scene of scenes) {
      // Icon priority: explicit `scene.icon` (v0.10.0+ user-customisable
      // via settings tab) → well-known scene id fallback → generic
      // "layers" icon. Stays backwards-compatible with the v0.7.x
      // default-scenes-without-icon shape.
      const fallback =
        scene.id === "blackout"
          ? "monitor-off"
          : scene.id === "brb"
            ? "coffee"
            : scene.id === "qa"
              ? "message-circle-question"
              : scene.id === "standby"
                ? "pause-circle"
                : "layers";
      const icon = scene.icon && scene.icon.trim().length > 0 ? scene.icon : fallback;
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
   * Swap the notes panel into edit mode. Reads the current slide's
   * raw notes markdown from the deck file (NOT the rendered HTML,
   * which has lost newlines / wikilink fidelity), shows it in a
   * textarea, and offers Save / Cancel buttons. Save writes back
   * via `replaceSlideNotes`.
   */
  private async enterNotesEditMode(): Promise<void> {
    if (this.notesEditing || !this.notesEl) return;
    const deckPath = this.findPreviewDeckPath();
    const currentIdx = this.state?.currentIdx;
    if (!deckPath || typeof currentIdx !== "number") {
      new Notice("Open a deck first.");
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(deckPath);
    if (!(file instanceof TFile)) {
      new Notice(`Deck file not found: ${deckPath}`);
      return;
    }
    const markdown = await this.app.vault.read(file);
    const currentNotes = readSlideNotes(markdown, currentIdx);

    this.notesEditing = true;
    this.notesEl.empty();
    this.notesEl.addClass("slides-ng-speaker-notes-editing");
    const textarea = this.notesEl.createEl("textarea", {
      cls: "slides-ng-speaker-notes-textarea",
      attr: { rows: "5" },
    });
    textarea.value = currentNotes;
    // Auto-focus + place cursor at end.
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 0);

    const actions = this.notesEl.createDiv({ cls: "slides-ng-speaker-notes-actions" });
    const save = actions.createEl("button", {
      cls: "slides-ng-speaker-btn mod-cta",
      text: "Save",
      attr: { type: "button" },
    });
    const cancel = actions.createEl("button", {
      cls: "slides-ng-speaker-btn",
      text: "Cancel",
      attr: { type: "button" },
    });

    save.addEventListener("click", async () => {
      const newValue = textarea.value;
      try {
        // Re-read fresh content (the deck file might have changed
        // since we entered edit mode — e.g. another save from the
        // editor). Then write back the updated slice.
        const fresh = await this.app.vault.read(file);
        const updated = replaceSlideNotes(fresh, currentIdx, newValue);
        await this.app.vault.modify(file, updated);
      } catch (err) {
        new Notice(
          "Failed to save notes: " +
            (err instanceof Error ? err.message : String(err))
        );
        return;
      }
      this.exitNotesEditMode();
      // v0.11.12: immediately repaint the notes panel with the newly-
      // saved value rendered to HTML. Previously we only cleared the
      // editing flag and waited for the iframe re-render's state
      // event to repaint — but the textarea was still visible until
      // that round-trip completed (~500ms after vault.modify), so it
      // LOOKED like the save did nothing. Render synchronously via
      // the same marked instance scenes use.
      if (this.notesEl) {
        const trimmed = newValue.trim();
        const html =
          trimmed.length === 0
            ? "<em>No notes</em>"
            : (sceneMd.parse(newValue, { async: false }) as string);
        this.notesEl.innerHTML = html;
      }
      new Notice("Notes saved.");
    });

    cancel.addEventListener("click", () => {
      this.exitNotesEditMode();
      // Repaint with the last-known state notes.
      if (this.state && this.notesEl) {
        this.notesEl.innerHTML = this.state.notesHtml || "<em>No notes</em>";
      }
    });

    // Esc cancels; Cmd/Ctrl+Enter saves.
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel.click();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        save.click();
      }
    });
  }

  private exitNotesEditMode(): void {
    this.notesEditing = false;
    if (this.notesEl) {
      this.notesEl.removeClass("slides-ng-speaker-notes-editing");
    }
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
        autoH1Breaks: settings?.autoH1Breaks,
        sceneInheritThemeBg: settings?.sceneInheritThemeBg,
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

  /**
   * Drive the mini-iframe to a specific slide index (clamped to total).
   *
   * v0.10.2: there's a race — the speaker view's first driveTo call
   * happens immediately after `srcdoc = html` is set, but inside the
   * iframe the postMessage listener doesn't get installed until the
   * srcdoc HTML has parsed up to the bridge script. Messages posted
   * before that point are silently dropped, and the mini gets stuck
   * showing slide 0 (which equals the main preview's current slide
   * on initial open). Fix: retry the post until the iframe's reveal
   * has actually reached the requested index, up to a small cap.
   */
  private driveVisualNextSlideTo(idx: number): void {
    if (!this.nextSlideIframe?.contentWindow) return;
    // v0.11.24: cancel any prior burst's pending posts before
    // scheduling new ones. Without this, a rapid sequence of
    // navigations queued overlapping bursts; the first burst's later
    // posts arrived after the second burst's first post had already
    // updated the up-next iframe to the new slide, briefly flipping
    // back to the previous one — same flicker class as the picker
    // current-tile bug (v0.11.21).
    for (const id of this.visualNextBurstTimers) {
      window.clearTimeout(id);
    }
    this.visualNextBurstTimers = [];
    const safeIdx = Math.max(0, idx);
    const post = (): void => {
      try {
        this.nextSlideIframe?.contentWindow?.postMessage(
          { type: "slides-ng-cmd", cmd: "goto", idx: safeIdx },
          "*"
        );
      } catch (_) { /* iframe gone */ }
    };
    post();
    // Retry a few times in the first second to cover the bridge-not-
    // yet-listening case for fresh iframes. Cheap (~5 messages).
    const delays = [50, 150, 350, 700];
    for (const d of delays) {
      this.visualNextBurstTimers.push(window.setTimeout(post, d));
    }
  }

  // ===== v0.11.0 picker-strip support =====

  /**
   * Render the deck into the picker iframe + switch the iframe into
   * picker-strip mode. Mirrors `ensureVisualNextSlideRendered()`:
   * only re-renders when the deck path or mtime changes.
   */
  private async ensurePickerStripRendered(): Promise<void> {
    if (!this.pickerStripIframe) return;
    const deckPath = this.findPreviewDeckPath();
    if (!deckPath) return;
    const file = this.app.vault.getAbstractFileByPath(deckPath);
    if (!(file instanceof TFile)) return;
    const mtime = file.stat.mtime;
    if (
      deckPath === this.lastPickerRenderedPath &&
      mtime === this.lastPickerRenderedMtime
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
        autoH1Breaks: settings?.autoH1Breaks,
        sceneInheritThemeBg: settings?.sceneInheritThemeBg,
        showRevealControlsEmbedded: false,
        showRevealMenuEmbedded: false,
        resolveImage: (raw) => this.resolveDeckImage(raw, file.path),
      });
      this.pickerStripIframe.srcdoc = html;
      this.lastPickerRenderedPath = deckPath;
      this.lastPickerRenderedMtime = mtime;
      // v0.11.17: peek per-deck `slides-ng-picker-tile-width` and
      // cache it so the magnifier button's effectiveTileWidth() also
      // sees the override. Accepts a number (pixels), `0` (auto), or
      // a named preset ("compact" | "comfortable" | "big").
      this.deckPickerTileWidth = this.peekDeckTileWidth(markdown);
      // After the iframe loads, post enablePickerStrip. Use a short
      // retry burst because the bridge listener may not be up yet.
      const orient = this.normalizeOrientation(settings?.speakerPickerOrientation);
      const tileWidth = this.effectiveTileWidth();
      // Refresh the size button icon to reflect any per-deck override
      // (so the inline UI matches what's actually applied).
      this.applyPickerSizeButton(this.resolvePickerTileSizePreset(tileWidth));
      const post = (): void => {
        this.postToPicker({
          type: "slides-ng-cmd",
          cmd: "enablePickerStrip",
          orientation: orient,
          tileWidth,
          // v0.11.2: tell the iframe which tile is "current". Inside
          // the picker iframe Reveal.getIndices() is always 0 (we
          // never navigate that iframe), so this is the only reliable
          // signal for the initial highlight.
          currentIdx: this.state?.currentIdx ?? 0,
        });
      };
      post();
      // v0.11.14: extended the retry window to 2.5 s + added the
      // bridge-ready postback fallback (see messageHandler).
      for (const delay of [80, 200, 450, 900, 1500, 2500]) {
        window.setTimeout(post, delay);
      }
    } catch (err) {
      console.warn("[slides-ng] picker-strip render failed", err);
    }
  }

  /** Forward a message to the picker iframe. No-op if not mounted. */
  private postToPicker(payload: Record<string, unknown>): void {
    const win = this.pickerStripIframe?.contentWindow;
    if (!win) return;
    win.postMessage(payload, "*");
  }

  /**
   * Update the orientation-toggle button's icon + tooltip based on
   * the CURRENT orientation. Called on view init + on click.
   */
  private applyPickerOrientButton(orientation: PickerOrientation): void {
    if (!this.pickerOrientationBtn) return;
    this.pickerOrientationBtn.empty();
    const iconEl = this.pickerOrientationBtn.createSpan({
      cls: "slides-ng-speaker-btn-icon",
    });
    // v0.11.15: per-mode icon + tooltip; click cycles to the next.
    // v0.11.18: auto = CSS grid auto-fill — fills the strip with as
    // many columns as fit at the magnifier's MIN cell size. (Was:
    // 'auto picks between vertical-1 / vertical-2 / horizontal at
    // build time' — that flavour wasn't actually responsive.)
    const meta: Record<PickerOrientation, { icon: string; tip: string }> = {
      "vertical-1": {
        icon: "rows",
        tip: "Picker: 1-column (tile fills width). Click for 2-column.",
      },
      "vertical-2": {
        icon: "columns-2",
        tip: "Picker: 2-column (tiles fill each column). Click for horizontal.",
      },
      horizontal: {
        icon: "panel-right",
        tip: "Picker: horizontal strip. Click for auto-fit.",
      },
      auto: {
        icon: "layout-grid",
        tip:
          "Picker: auto-fit — fills with as many columns as fit at the " +
          "magnifier's min size. Click for 1-column.",
      },
    };
    const m = meta[orientation];
    setIcon(iconEl, m.icon);
    setTooltip(this.pickerOrientationBtn, m.tip);
  }

  /**
   * v0.11.15: collapse the union — legacy "vertical" maps to
   * "vertical-1"; everything else passes through.
   */
  private normalizeOrientation(
    raw: SlidesNGSettings["speakerPickerOrientation"] | undefined
  ): PickerOrientation {
    if (raw === "vertical" || raw === undefined) return "vertical-1";
    return raw as PickerOrientation;
  }

  /**
   * v0.11.17: resolve the current picker tile width to one of:
   *   - a named preset ("compact" | "comfortable" | "big") when the
   *     value exactly matches `PICKER_TILE_PRESETS`
   *   - "auto" when the value is 0
   *   - "custom" when the value is a positive integer that isn't a
   *     preset (set manually in Settings or via frontmatter)
   * Used to pick the right icon + tooltip for the magnifier button.
   */
  private resolvePickerTileSizePreset(
    width: number
  ): keyof typeof PICKER_TILE_PRESETS | "auto" | "custom" {
    if (!width || width === 0) return "auto";
    for (const [name, px] of Object.entries(PICKER_TILE_PRESETS) as Array<
      [keyof typeof PICKER_TILE_PRESETS, number]
    >) {
      if (px === width) return name;
    }
    return "custom";
  }

  /**
   * v0.11.17: update the magnifier-cycle button icon + tooltip
   * based on the CURRENT tile-size preset. Each state advertises
   * what the NEXT click does so the user doesn't have to guess.
   */
  private applyPickerSizeButton(
    preset: keyof typeof PICKER_TILE_PRESETS | "auto" | "custom"
  ): void {
    if (!this.pickerSizeBtn) return;
    this.pickerSizeBtn.empty();
    const iconEl = this.pickerSizeBtn.createSpan({
      cls: "slides-ng-speaker-btn-icon",
    });
    // v0.11.23: magnifier preset now affects layout in every
    // orientation (1-col, 2-col, auto-fit, AND horizontal). In
    // vertical modes the preset is tile width per column (orientation
    // caps column count). In horizontal it's tile width along the
    // film strip (height auto-derives via aspect). "auto" (preset = 0)
    // means "fill the column" in vertical modes and "fill the strip
    // height" in horizontal.
    const meta: Record<
      keyof typeof PICKER_TILE_PRESETS | "auto" | "custom",
      { icon: string; tip: string }
    > = {
      auto: {
        icon: "zoom-in",
        tip: "Tile size: auto (~160 px). Click for compact.",
      },
      compact: {
        icon: "zoom-out",
        tip: "Tile size: compact (100 px). Click for comfortable.",
      },
      comfortable: {
        icon: "search",
        tip: "Tile size: comfortable (180 px). Click for big.",
      },
      big: {
        icon: "zoom-in",
        tip: "Tile size: big (280 px). Click for compact.",
      },
      custom: {
        icon: "search",
        tip:
          "Tile size: custom (set in Settings or deck frontmatter). " +
          "Click to enter preset cycle.",
      },
    };
    const m = meta[preset];
    setIcon(iconEl, m.icon);
    setTooltip(this.pickerSizeBtn, m.tip);
  }

  /**
   * v0.11.17: compute the picker tile width to send to the iframe.
   * Precedence: per-deck frontmatter > persisted setting > 0 (auto).
   */
  private effectiveTileWidth(): number {
    if (typeof this.deckPickerTileWidth === "number") {
      return this.deckPickerTileWidth;
    }
    const s = this.getSettings?.();
    return s?.speakerPickerTileWidth ?? 0;
  }

  /**
   * v0.11.17: read the per-deck `slides-ng-picker-tile-width`
   * frontmatter override from the deck's source markdown. Accepts:
   *   - a positive integer ("220")
   *   - `0` (explicit auto override)
   *   - a named preset alias ("compact" | "comfortable" | "big")
   * Returns undefined if the key is absent or the value is
   * unparseable. The caller caches this so the picker re-render
   * pipeline doesn't pay the regex cost per tile.
   */
  private peekDeckTileWidth(markdown: string): number | undefined {
    const raw = peekFrontmatterRaw(markdown, "slides-ng-picker-tile-width");
    if (raw === undefined) return undefined;
    if (raw in PICKER_TILE_PRESETS) {
      return PICKER_TILE_PRESETS[raw as keyof typeof PICKER_TILE_PRESETS];
    }
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) return n;
    return undefined;
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
    // v0.11.15: apply per-slide panel-visibility override. The
    // current slide's `slides-ng-hide-panels:` frontmatter list
    // (delivered via state.hidePanels) temporarily overrides the
    // user's settings. Restored when navigating to a slide without
    // the override OR with a different list. Doesn't touch the
    // user's actual `settings.speakerPanelVisibility` — purely a
    // per-slide override applied at the DOM level.
    this.applyPerSlideHidePanels(this.state.hidePanels ?? []);
    if (this.notesEl && !this.notesEditing) {
      this.notesEl.innerHTML = this.state.notesHtml || "<em>No notes</em>";
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
    // v0.11.0: drive the picker. Either render the text list (legacy)
    // or update the thumbnail-strip iframe's current-tile highlight.
    if (this.pickerStripIframe) {
      void this.ensurePickerStripRendered().then(() => {
        // v0.11.2: burst the setPickerCurrent post. Single-shot was
        // racing the iframe's bridge listener install on fresh
        // mounts (observed in E2E screenshots where the strip
        // stayed marked at tile 0 even though the deck had
        // advanced 10 slides). Cheap — ~5 messages total.
        // v0.11.21: cancel any prior burst's delayed posts before
        // scheduling new ones. Without this, rapid navigation
        // caused the previous idx to overwrite the new highlight
        // mid-flight — the user-reported "tile flips back and forth
        // for a second after click" bug.
        for (const id of this.pickerCurrentBurstTimers) {
          window.clearTimeout(id);
        }
        this.pickerCurrentBurstTimers = [];
        const idx = this.state!.currentIdx;
        const post = (): void => {
          this.postToPicker({
            type: "slides-ng-cmd",
            cmd: "setPickerCurrent",
            idx,
          });
        };
        post();
        for (const delay of [60, 180, 400, 900, 1500, 2500]) {
          this.pickerCurrentBurstTimers.push(window.setTimeout(post, delay));
        }
      });
    } else {
      this.renderPicker();
    }
  }

  /**
   * Render the slide picker (v0.10.3 rebuild): a single scrollable
   * column of slide rows. Each row is a button with a numbered badge
   * on the left + the slide title on the right. Current slide gets
   * the accent treatment and auto-scrolls into view.
   *
   * No more compact/list mode toggle. The "Show all N slides →"
   * footer link is gone too — the full list is right there. Thumbnail
   * support is queued for a follow-up release; for now this is text-
   * based.
   */
  private renderPicker(): void {
    if (!this.pickerEl || !this.state) return;
    this.pickerEl.empty();
    const { slides, currentIdx } = this.state;
    let currentEl: HTMLElement | null = null;
    for (const s of slides) {
      const isCurrent = s.idx === currentIdx;
      const isPast = s.idx < currentIdx;
      const item = this.pickerEl.createEl("button", {
        cls: [
          "slides-ng-speaker-list-item",
          isCurrent ? "current" : "",
          isPast ? "past" : "",
        ]
          .filter(Boolean)
          .join(" "),
        attr: { type: "button" },
      });
      item.createSpan({
        cls: "slides-ng-speaker-list-num",
        text: String(s.idx + 1),
      });
      item.createSpan({
        cls: "slides-ng-speaker-list-title",
        text: s.title || "(untitled)",
      });
      item.addEventListener("click", () => this.send("goto", s.idx));
      if (isCurrent) currentEl = item;
    }
    // Auto-scroll the current slide into view (block: nearest avoids
    // unnecessary scroll when the slide is already in the viewport).
    if (currentEl) {
      currentEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
    if (this.timerEl) {
      this.timerEl.setText("00:00:00");
      this.timerEl.classList.remove("warning", "overrun");
    }
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
    const settings = this.getSettings?.();
    const mode = settings?.speakerTimerMode ?? "elapsed";
    const elapsed =
      this.timerStartMs === null ? this.timerPausedMs : Date.now() - this.timerStartMs;
    if (mode === "countdown") {
      const targetMs = (settings?.speakerTimerCountdownMinutes ?? 30) * 60 * 1000;
      const remaining = targetMs - elapsed;
      this.timerEl.setText(formatMs(Math.abs(remaining), remaining < 0));
      // Warning state once 80% consumed; overrun state once past target.
      const pct = elapsed / targetMs;
      this.timerEl.classList.toggle("warning", pct >= 0.8 && pct < 1);
      this.timerEl.classList.toggle("overrun", remaining < 0);
    } else {
      // elapsed + lap render identically; lap just resets on slide change.
      this.timerEl.setText(formatMs(elapsed, false));
      this.timerEl.classList.remove("warning", "overrun");
    }
  }

  /**
   * Reset the timer to zero AND keep it running if it was running.
   * Used by lap mode on every slide change so the timer always reflects
   * "time spent on the current slide."
   */
  private lapResetTimer(): void {
    const wasRunning = this.timerStartMs !== null;
    this.timerStartMs = wasRunning ? Date.now() : null;
    this.timerPausedMs = 0;
    this.applyTimerLabel();
  }
}

/**
 * Format a millisecond duration as `HH:MM:SS`. Prefix with `-` when
 * `negative` is true (used by countdown overrun rendering).
 */
function formatMs(ms: number, negative: boolean): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${negative ? "-" : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(
    2,
    "0"
  )}`;
}
