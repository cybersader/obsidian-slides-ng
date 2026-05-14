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
} from "./settings";

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
    // Resolve initial picker mode from settings (if available).
    const settings = this.getSettings?.();
    if (settings?.speakerPickerDefaultMode) {
      this.pickerMode = settings.speakerPickerDefaultMode;
    }

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
    modeSelect.addEventListener("change", () => {
      const s = this.getSettings?.();
      if (!s) return;
      s.speakerTimerMode = modeSelect.value as SlidesNGSettings["speakerTimerMode"];
      void this.saveSettings?.();
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

    // Next-slide preview line (text). Use a child span for the
    // actual text so we can call setText on it without wiping the
    // drag handle (which setPanelVisible inserts as a sibling).
    const nextLineWrap = container.createDiv({ cls: "slides-ng-speaker-next" });
    this.nextLineEl = nextLineWrap.createSpan({
      cls: "slides-ng-speaker-next-text",
      text: "Next: —",
    });
    setPanelVisible(nextLineWrap, "nextLine");

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

    // Picker — header + content. setPanelVisible wraps both so they hide together.
    const pickerWrap = container.createDiv({ cls: "slides-ng-speaker-picker-wrap" });
    setPanelVisible(pickerWrap, "picker");
    const pickerHeader = pickerWrap.createDiv({ cls: "slides-ng-speaker-picker-header" });
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
    this.pickerEl = pickerWrap.createDiv({ cls: "slides-ng-speaker-picker" });

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
    if (!title) {
      handle.classList.add("slides-ng-speaker-panel-handle--floating");
      panel.insertBefore(handle, panel.firstChild);
      return;
    }
    const titleParent = title.parentElement;
    const titleParentIsHeader =
      !!titleParent && /-header\b/.test(titleParent.className);
    if (titleParentIsHeader) {
      // The existing header (notesHeader, pickerHeader) uses
      // `justify-content: space-between` to push the title to the
      // left and a trailing action button (Edit / Mode toggle) to
      // the right. Inserting the handle as a third sibling would
      // trigger space-between's start/center/end distribution —
      // the v0.10.0 release shipped this bug, with the title ending
      // up in the visual centre. Fix: wrap handle+title in a
      // sub-group so the header still sees two children and
      // distributes correctly.
      const group = document.createElement("div");
      group.className = "slides-ng-speaker-panel-header-group";
      titleParent!.insertBefore(group, title);
      group.appendChild(handle);
      group.appendChild(title);
    } else if (titleParent) {
      // Wrap title in a new header div so the handle + title sit on a
      // row without forcing row-direction on the panel itself.
      const header = document.createElement("div");
      header.className = "slides-ng-speaker-panel-header";
      titleParent.insertBefore(header, title);
      header.appendChild(handle);
      header.appendChild(title);
    } else {
      panel.insertBefore(handle, panel.firstChild);
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
    ind.style.left = `${rect.left - containerRect.left}px`;
    ind.style.width = `${rect.width}px`;
    // Position the line so it visually sits BETWEEN panels — half
    // above + half below the boundary, which makes "where will it
    // drop" obvious at a glance.
    ind.style.top = isAbove
      ? `${rect.top - containerRect.top - 1}px`
      : `${rect.bottom - containerRect.top - 1}px`;
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
      // The vault modify event triggers the preview re-render, which
      // posts a new state with the updated notesHtml — applyState
      // will repaint the notes panel automatically.
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
    this.renderPicker();
  }

  private renderPicker(): void {
    if (!this.pickerEl || !this.state) return;
    this.pickerEl.empty();
    const { slides, currentIdx } = this.state;
    if (this.pickerMode === "compact") {
      // Compact: previous (faded) + current (accent) + next 3
      // (upcoming). Each row is clickable to jump to that slide.
      // Number-badge on the left, title on the right, all rows fixed-
      // height for at-a-glance readability during a live presentation.
      const summary = this.pickerEl.createDiv({ cls: "slides-ng-speaker-compact" });
      const start = Math.max(0, currentIdx - 1);
      const end = Math.min(slides.length, currentIdx + 4);
      for (let i = start; i < end; i++) {
        const s = slides[i];
        const isCurrent = i === currentIdx;
        const isPast = i < currentIdx;
        const row = summary.createEl("button", {
          cls: [
            "slides-ng-speaker-compact-row",
            isCurrent ? "current" : "",
            isPast ? "past" : "",
          ]
            .filter(Boolean)
            .join(" "),
          attr: { type: "button" },
        });
        row.createSpan({
          cls: "slides-ng-speaker-compact-num",
          text: String(s.idx + 1),
        });
        row.createSpan({
          cls: "slides-ng-speaker-compact-title",
          text: s.title || "(untitled)",
        });
        row.addEventListener("click", () => this.send("goto", s.idx));
      }
      // Footer link to open the Grid for jumping outside the compact
      // window. Styled as a small text-link (v0.10.0+) so it's
      // visually distinct from the slide-row buttons above.
      const footer = summary.createEl("button", {
        cls: "slides-ng-speaker-compact-all",
        text: `Show all ${slides.length} slides →`,
        attr: { type: "button" },
      });
      footer.addEventListener("click", () => this.send("toggleOverview"));
    } else {
      for (const s of slides) {
        const item = this.pickerEl.createEl("button", {
          cls:
            "slides-ng-speaker-list-item" +
            (s.idx === currentIdx ? " current" : ""),
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
