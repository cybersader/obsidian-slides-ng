import { App, PluginSettingTab, Setting, setIcon } from "obsidian";
import type SlidesNGPlugin from "./main";
import {
  REVEAL_TRANSITIONS,
  IMAGE_LAYOUT_SPLITS,
  BUNDLED_CODE_THEMES,
  TRANSITION_SPEEDS,
  DEFAULT_SCENES,
  SPEAKER_PANEL_LABELS,
  DEFAULT_SPEAKER_PANEL_VISIBILITY,
} from "./settings";
import type { SceneDefinition, SpeakerPanelId } from "./settings";
import { availableThemes } from "./render/revealAssets";
import { KNOWN_LAYOUTS } from "./render/layouts";

export class SlidesNGSettingTab extends PluginSettingTab {
  private plugin: SlidesNGPlugin;

  constructor(app: App, plugin: SlidesNGPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ---------- Rendering ----------
    new Setting(containerEl).setName("Rendering").setHeading();

    new Setting(containerEl)
      .setName("Default theme")
      .setDesc(
        "Theme applied to decks that don't set `theme:` in their frontmatter."
      )
      .addDropdown((d) => {
        for (const t of availableThemes()) d.addOption(t, t);
        d.setValue(this.plugin.settings.defaultTheme).onChange(async (v) => {
          this.plugin.settings.defaultTheme = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Default transition")
      .setDesc(
        "Slide transition for decks that don't set `transition:` in their frontmatter."
      )
      .addDropdown((d) => {
        for (const t of REVEAL_TRANSITIONS) d.addOption(t, t);
        d.setValue(this.plugin.settings.defaultTransition).onChange(async (v) => {
          this.plugin.settings.defaultTransition = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Transition speed")
      .setDesc(
        "Reveal animation pace. `Default` is reveal's stock; `fast` is ~300 ms; `slow` is ~1200 ms."
      )
      .addDropdown((d) => {
        for (const t of TRANSITION_SPEEDS) d.addOption(t, t);
        d.setValue(this.plugin.settings.transitionSpeed).onChange(async (v) => {
          this.plugin.settings.transitionSpeed = v as "default" | "fast" | "slow";
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Default layout")
      .setDesc(
        "Fallback layout for slides that don't set `layout:` in their frontmatter."
      )
      .addDropdown((d) => {
        for (const l of KNOWN_LAYOUTS) d.addOption(l, l);
        d.setValue(this.plugin.settings.defaultLayout).onChange(async (v) => {
          this.plugin.settings.defaultLayout = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Show reveal controls in preview")
      .setDesc(
        "Show reveal.js's arrow buttons and progress bar inside the in-Obsidian preview iframe."
      )
      .addToggle((t) => {
        t.setValue(this.plugin.settings.showRevealControlsEmbedded).onChange(
          async (v) => {
            this.plugin.settings.showRevealControlsEmbedded = v;
            await this.plugin.saveSettings();
          }
        );
      });

    new Setting(containerEl)
      .setName("Show menu plugin in preview")
      .setDesc(
        "Show the reveal.js-menu hamburger (heading outline + slide list + theme switcher) in the preview iframe."
      )
      .addToggle((t) => {
        t.setValue(this.plugin.settings.showRevealMenuEmbedded).onChange(
          async (v) => {
            this.plugin.settings.showRevealMenuEmbedded = v;
            await this.plugin.saveSettings();
          }
        );
      });

    // ---------- Code ----------
    new Setting(containerEl).setName("Code").setHeading();

    new Setting(containerEl)
      .setName("Syntax theme")
      .setDesc("Shiki theme used to highlight fenced code blocks.")
      .addDropdown((d) => {
        for (const t of BUNDLED_CODE_THEMES) d.addOption(t, t);
        d.setValue(this.plugin.settings.codeTheme).onChange(async (v) => {
          this.plugin.settings.codeTheme = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Line-step dim opacity")
      .setDesc(
        "Opacity (0–1) of non-active lines during code line-stepping (the Slidev `[1|2-3|all]` syntax). Lower = stronger spotlight."
      )
      .addSlider((s) => {
        s.setLimits(0, 1, 0.05)
          .setValue(this.plugin.settings.lineStepDimOpacity)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.lineStepDimOpacity = v;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Code block max height")
      .setDesc(
        "Any valid CSS length (e.g. `60vh`, `400px`). Long code blocks scroll internally instead of overflowing the slide. Set to `none` to disable the cap entirely."
      )
      .addText((t) => {
        t.setValue(this.plugin.settings.codeBlockMaxHeight).onChange(async (v) => {
          this.plugin.settings.codeBlockMaxHeight = v.trim() || "60vh";
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Code block overflow scroll")
      .setDesc(
        "When the cap above is hit, scroll the overflow internally. Disable to hide instead (forces deck authors to shorten the snippet)."
      )
      .addToggle((t) => {
        t.setValue(this.plugin.settings.codeBlockOverflowScroll).onChange(
          async (v) => {
            this.plugin.settings.codeBlockOverflowScroll = v;
            await this.plugin.saveSettings();
          }
        );
      });

    new Setting(containerEl)
      .setName("Magic-move animation duration (ms)")
      .setDesc(
        "Duration of the token-morph animation between paired magic-move code blocks. Stock library default is five hundred milliseconds."
      )
      .addText((t) => {
        t.setValue(String(this.plugin.settings.magicMoveDurationMs)).onChange(
          async (v) => {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n >= 100 && n <= 3000) {
              this.plugin.settings.magicMoveDurationMs = n;
              await this.plugin.saveSettings();
            }
          }
        );
      });

    // ---------- Layouts ----------
    new Setting(containerEl).setName("Layouts").setHeading();

    new Setting(containerEl)
      .setName("Image layout column split")
      .setDesc(
        "Ratio for `image-left` / `image-right` layouts. 60/40 gives the image more space; 40/60 gives the text more."
      )
      .addDropdown((d) => {
        for (const s of IMAGE_LAYOUT_SPLITS) d.addOption(s, s);
        d.setValue(this.plugin.settings.imageLayoutSplit).onChange(async (v) => {
          this.plugin.settings.imageLayoutSplit = v as "50/50" | "60/40" | "40/60";
          await this.plugin.saveSettings();
        });
      });

    // ---------- Editor ----------
    new Setting(containerEl).setName("Editor").setHeading();

    new Setting(containerEl)
      .setName("Follow cursor in editor")
      .setDesc(
        "When you click in the Markdown editor, the preview jumps to the slide your cursor is on."
      )
      .addToggle((t) => {
        t.setValue(this.plugin.settings.followCursorInEditor).onChange(
          async (v) => {
            this.plugin.settings.followCursorInEditor = v;
            await this.plugin.saveSettings();
          }
        );
      });

    // ---------- Speaker ----------
    new Setting(containerEl).setName("Speaker").setHeading();

    // v0.10.3: removed the "Slide picker mode" setting — the picker
    // is now a single scrollable column (no compact/list toggle).
    // The `speakerPickerDefaultMode` field stays on the settings
    // type for back-compat read, but the UI is gone.

    // v0.11.0: picker style + orientation + tile width
    new Setting(containerEl)
      .setName("Slide picker style")
      .setDesc(
        "`Thumbnails` shows real slide miniatures (PowerPoint-like). `Text` shows numbered titles only — lighter weight, useful for very long decks."
      )
      .addDropdown((d) => {
        d.addOption("thumbnails", "Thumbnails");
        d.addOption("text", "Text");
        d.setValue(this.plugin.settings.speakerPickerStyle ?? "thumbnails").onChange(
          async (v) => {
            this.plugin.settings.speakerPickerStyle = v as "thumbnails" | "text";
            await this.plugin.saveSettings();
          }
        );
      });

    new Setting(containerEl)
      .setName("Picker orientation")
      .setDesc(
        "Layout direction for the thumbnail picker. `Vertical` stacks tiles in a column (PowerPoint default); `horizontal` flows them in a row (film-strip view)."
      )
      .addDropdown((d) => {
        d.addOption("vertical", "Vertical");
        d.addOption("horizontal", "Horizontal");
        d.setValue(this.plugin.settings.speakerPickerOrientation ?? "vertical").onChange(
          async (v) => {
            this.plugin.settings.speakerPickerOrientation =
              v as "vertical" | "horizontal";
            await this.plugin.saveSettings();
          }
        );
      });

    new Setting(containerEl)
      .setName("Picker tile width (px)")
      .setDesc(
        "Override tile width for the thumbnail picker. Zero (the default) auto-fits tiles to the panel size."
      )
      .addText((t) => {
        t.setValue(String(this.plugin.settings.speakerPickerTileWidth ?? 0)).onChange(
          async (v) => {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n >= 0 && n <= 1000) {
              this.plugin.settings.speakerPickerTileWidth = n;
              await this.plugin.saveSettings();
            }
          }
        );
      });

    new Setting(containerEl)
      .setName("Timer tick interval (ms)")
      .setDesc(
        "How often the speaker view's elapsed timer refreshes its display. One thousand milliseconds is the natural rate for a seconds counter."
      )
      .addText((t) => {
        t.setValue(String(this.plugin.settings.speakerTimerTickMs)).onChange(
          async (v) => {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n >= 100 && n <= 60000) {
              this.plugin.settings.speakerTimerTickMs = n;
              await this.plugin.saveSettings();
            }
          }
        );
      });

    new Setting(containerEl)
      .setName("Timer default mode")
      .setDesc(
        "`Elapsed` counts up; `countdown` counts down from the configured minutes and goes negative on overrun; `lap` resets every slide change."
      )
      .addDropdown((d) => {
        d.addOption("elapsed", "Elapsed");
        d.addOption("countdown", "Countdown");
        d.addOption("lap", "Slide (lap)");
        d.setValue(this.plugin.settings.speakerTimerMode ?? "elapsed").onChange(
          async (v) => {
            this.plugin.settings.speakerTimerMode = v as
              | "elapsed"
              | "countdown"
              | "lap";
            await this.plugin.saveSettings();
          }
        );
      });

    new Setting(containerEl)
      .setName("Countdown target (minutes)")
      .setDesc(
        "Total duration for the countdown timer mode. Ignored in elapsed/lap modes."
      )
      .addText((t) => {
        t.setValue(
          String(this.plugin.settings.speakerTimerCountdownMinutes ?? 30)
        ).onChange(async (v) => {
          const n = parseFloat(v);
          if (Number.isFinite(n) && n > 0 && n <= 600) {
            this.plugin.settings.speakerTimerCountdownMinutes = n;
            await this.plugin.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName("Multi-column panels at wide widths")
      .setDesc(
        "When the speaker pane is at least 900 pixels wide, flow panels into a 2-column grid instead of stacking them all vertically."
      )
      .addToggle((t) => {
        t.setValue(this.plugin.settings.speakerPanelsMultiColumn !== false).onChange(
          async (v) => {
            this.plugin.settings.speakerPanelsMultiColumn = v;
            await this.plugin.saveSettings();
          }
        );
      });

    // ---------- Speaker panels ----------
    new Setting(containerEl).setName("Speaker panels").setHeading();
    new Setting(containerEl)
      .setName("Visible panels")
      .setDesc(
        "Toggle individual panels in the speaker view. Hidden panels can be re-enabled here at any time. Reopen the speaker view to apply changes."
      );
    const panelIds: SpeakerPanelId[] = [
      "status",
      "controls",
      "timer",
      "nextLine",
      "visualNext",
      "scenes",
      "notes",
      "picker",
    ];
    for (const id of panelIds) {
      new Setting(containerEl)
        .setName(SPEAKER_PANEL_LABELS[id])
        .addToggle((t) => {
          const current =
            this.plugin.settings.speakerPanelVisibility[id] ??
            DEFAULT_SPEAKER_PANEL_VISIBILITY[id];
          t.setValue(current).onChange(async (v) => {
            this.plugin.settings.speakerPanelVisibility[id] = v;
            await this.plugin.saveSettings();
          });
        });
    }

    // ---------- Scenes ----------
    new Setting(containerEl).setName("Scenes").setHeading();

    new Setting(containerEl)
      .setName("Placeholder scenes")
      .setDesc(
        "Overlay slides the presenter can flash up mid-presentation (blackout, be right back, q & a, etc.). Each scene's content is rendered as Markdown when activated. Reopen the speaker view to pick up edits."
      );

    this.renderSceneEditor(containerEl);

    // ---------- Debug ----------
    new Setting(containerEl).setName("Debug").setHeading();
    new Setting(containerEl)
      .setName("Write debug log")
      .setDesc(
        "When on, lifecycle events (ribbon click, view setState, render) are appended to `slides-ng-debug.log` in the vault root. Useful for diagnosing render-on-open issues. Run the `Slides NG: Clear debug log` command to wipe."
      )
      .addToggle((t) => {
        t.setValue(this.plugin.settings.debugLogging !== false).onChange(
          async (v) => {
            this.plugin.settings.debugLogging = v;
            await this.plugin.saveSettings();
          }
        );
      });
  }

  private renderSceneEditor(containerEl: HTMLElement): void {
    const editor = containerEl.createDiv({ cls: "slides-ng-scene-editor" });
    const refresh = (): void => {
      editor.empty();
      const scenes = this.plugin.settings.scenes;
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const row = editor.createDiv({ cls: "slides-ng-scene-editor-row" });

        const labelInput = row.createEl("input", {
          attr: { type: "text", placeholder: "Label", value: scene.label },
        });
        labelInput.addEventListener("change", async () => {
          scenes[i] = { ...scene, label: labelInput.value };
          await this.plugin.saveSettings();
        });

        // Icon column: text input + live preview swatch. Any Lucide
        // name from https://lucide.dev/icons works (e.g. monitor-off,
        // coffee, message-circle-question, layers).
        const iconWrap = row.createDiv({ cls: "slides-ng-scene-editor-icon" });
        const iconPreview = iconWrap.createSpan({
          cls: "slides-ng-scene-editor-icon-preview",
        });
        const iconInput = iconWrap.createEl("input", {
          attr: {
            type: "text",
            placeholder: "Lucide icon (e.g. coffee)",
            value: scene.icon ?? "",
            title:
              "Pick any icon from https://lucide.dev/icons. Empty = automatic fallback.",
          },
        });
        const repaintIcon = (name: string): void => {
          iconPreview.empty();
          if (name && name.trim().length > 0) {
            setIcon(iconPreview, name.trim());
          }
        };
        repaintIcon(scene.icon ?? "");
        iconInput.addEventListener("input", () => repaintIcon(iconInput.value));
        iconInput.addEventListener("change", async () => {
          scenes[i] = { ...scene, icon: iconInput.value || undefined };
          await this.plugin.saveSettings();
        });

        const contentInput = row.createEl("textarea", {
          attr: { placeholder: "Markdown content (empty = blackout)" },
        });
        contentInput.value = scene.content;
        contentInput.addEventListener("change", async () => {
          scenes[i] = { ...scene, content: contentInput.value };
          await this.plugin.saveSettings();
        });

        const removeBtn = row.createEl("button", { text: "Remove" });
        removeBtn.addEventListener("click", async () => {
          this.plugin.settings.scenes.splice(i, 1);
          await this.plugin.saveSettings();
          refresh();
        });
      }

      const actions = editor.createDiv();
      const addBtn = actions.createEl("button", {
        cls: "slides-ng-scene-editor-add",
        text: "Add scene",
      });
      addBtn.addEventListener("click", async () => {
        const newId = `scene-${Date.now().toString(36)}`;
        const newScene: SceneDefinition = {
          id: newId,
          label: "New scene",
          content: "",
          icon: "layers",
        };
        this.plugin.settings.scenes.push(newScene);
        await this.plugin.saveSettings();
        refresh();
      });

      const resetBtn = actions.createEl("button", {
        cls: "slides-ng-scene-editor-add",
        text: "Reset to defaults",
        attr: { style: "margin-left: 0.5rem;" },
      });
      resetBtn.addEventListener("click", async () => {
        this.plugin.settings.scenes = DEFAULT_SCENES.map((s) => ({ ...s }));
        await this.plugin.saveSettings();
        refresh();
      });
    };
    refresh();
  }
}
