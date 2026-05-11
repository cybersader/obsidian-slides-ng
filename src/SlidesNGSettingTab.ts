import { App, PluginSettingTab, Setting } from "obsidian";
import type SlidesNGPlugin from "./main";
import { REVEAL_TRANSITIONS } from "./settings";
import { availableThemes } from "./render/revealAssets";

export class SlidesNGSettingTab extends PluginSettingTab {
  private plugin: SlidesNGPlugin;

  constructor(app: App, plugin: SlidesNGPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

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
  }
}
