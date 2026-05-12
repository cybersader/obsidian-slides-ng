import { App, PluginSettingTab, Setting } from "obsidian";
import type SlidesNGPlugin from "./main";
import {
  REVEAL_TRANSITIONS,
  IMAGE_LAYOUT_SPLITS,
  PICKER_MODES,
  BUNDLED_CODE_THEMES,
  TRANSITION_SPEEDS,
} from "./settings";
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

    new Setting(containerEl)
      .setName("Slide picker mode")
      .setDesc(
        "Initial mode for the speaker view's slide list. `Compact` shows current + next 3; `list` shows all."
      )
      .addDropdown((d) => {
        for (const m of PICKER_MODES) d.addOption(m, m);
        d.setValue(this.plugin.settings.speakerPickerDefaultMode).onChange(
          async (v) => {
            this.plugin.settings.speakerPickerDefaultMode = v as "compact" | "list";
            await this.plugin.saveSettings();
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
  }
}
