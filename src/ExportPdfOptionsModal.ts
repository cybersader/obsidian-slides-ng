/**
 * Modal shown before "Export for PDF" — collects user-tunable options
 * (notes on/off, aspect ratio, theme override) and returns them to
 * the export pipeline. Lives in its own file so it's tiny + easy to
 * unit-test the option-collection logic.
 */

import { App, Modal, Setting } from "obsidian";
import type { PdfExportOptions } from "./export/exportStandalone";
import { availableThemes } from "./render/revealAssets";

export class ExportPdfOptionsModal extends Modal {
  private options: PdfExportOptions = {
    showNotes: false,
    aspectRatio: "current",
    themeOverride: null,
    maxPagesPerSlide: 1,
    pdfStyle: "slides",
  };
  private onSubmit: (options: PdfExportOptions | null) => void;
  /** Theme that the deck would render with by default — shown as the active option. */
  private currentTheme: string;

  constructor(
    app: App,
    currentTheme: string,
    onSubmit: (options: PdfExportOptions | null) => void
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.currentTheme = currentTheme;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("slides-ng-export-pdf-modal");
    contentEl.createEl("h2", { text: "Export for PDF" });
    contentEl.createEl("p", {
      cls: "slides-ng-export-pdf-modal-hint",
      text: "Pick how the printed pages should look. Cancel to abort.",
    });

    new Setting(contentEl)
      .setName("Layout")
      .setDesc(
        "Slides: render as slide cards with theme styling, one per page. Document: flow content as a regular handout — sections become headings, notes inline, no slide chrome. Document mode is better for text-heavy decks that keep overflowing."
      )
      .addDropdown((d) => {
        d.addOption("slides", "Slides (cards with theme)");
        d.addOption("document", "Document (flowing handout)");
        d.setValue(this.options.pdfStyle ?? "slides").onChange((v) => {
          this.options.pdfStyle = v as PdfExportOptions["pdfStyle"];
        });
      });

    new Setting(contentEl)
      .setName("Include speaker notes")
      .setDesc(
        "Embed notes alongside each slide in the PDF. Useful for handouts."
      )
      .addToggle((t) => {
        t.setValue(!!this.options.showNotes).onChange((v) => {
          this.options.showNotes = v;
        });
      });

    new Setting(contentEl)
      .setName("Aspect ratio")
      .setDesc(
        "Override the deck's slide dimensions for printing. `Current` uses the deck's own settings."
      )
      .addDropdown((d) => {
        d.addOption("current", "Current (deck default)");
        d.addOption("16:9", "16:9 (widescreen, 1280×720)");
        d.addOption("4:3", "4:3 (traditional, 1024×768)");
        d.setValue(this.options.aspectRatio ?? "current").onChange((v) => {
          this.options.aspectRatio = v as PdfExportOptions["aspectRatio"];
        });
      });

    new Setting(contentEl)
      .setName("Theme override")
      .setDesc(
        "Use a different theme just for the PDF (e.g. a light theme for printing). `Current` uses the deck's own theme."
      )
      .addDropdown((d) => {
        d.addOption("__current__", `Current (${this.currentTheme})`);
        for (const theme of availableThemes()) {
          d.addOption(theme, theme);
        }
        d.setValue("__current__").onChange((v) => {
          this.options.themeOverride = v === "__current__" ? null : v;
        });
      });

    new Setting(contentEl)
      .setName("Max pages per slide on overflow")
      .setDesc(
        "When a slide's content is taller than the page, reveal can split it across multiple pages. Default 1 (clip overflow)."
      )
      .addText((t) => {
        t.setValue(String(this.options.maxPagesPerSlide ?? 1)).onChange((v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n >= 1 && n <= 20) {
            this.options.maxPagesPerSlide = n;
          }
        });
      });

    const actions = contentEl.createDiv({ cls: "slides-ng-export-pdf-actions" });
    const cancel = actions.createEl("button", {
      cls: "mod-warning",
      text: "Cancel",
      attr: { type: "button" },
    });
    const submit = actions.createEl("button", {
      cls: "mod-cta",
      text: "Export",
      attr: { type: "button" },
    });
    cancel.addEventListener("click", () => {
      this.onSubmit(null);
      this.close();
    });
    submit.addEventListener("click", () => {
      this.onSubmit(this.options);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
