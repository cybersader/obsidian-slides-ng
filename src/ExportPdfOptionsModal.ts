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
    // v0.11.46 experimentation knobs — all default off / "no override".
    autoShrink: false,
    pageSize: "current",
    pageMargin: "normal",
    grayscale: false,
    hideBackgrounds: false,
    slideNumberStamp: false,
    headerText: "",
    footerText: "",
  };
  private onSubmit: (options: PdfExportOptions | null) => void;
  /** Theme that the deck would render with by default — shown as the active option. */
  private currentTheme: string;
  /**
   * v0.11.57: render-preview callback. The view passes in a
   * function that takes the current options and returns the
   * exported HTML; the modal pumps that into a sandboxed iframe
   * so the user sees a live preview of what the PDF will look
   * like before they hit Export.
   */
  private renderPreview?: (options: PdfExportOptions, zoom: number) => Promise<string>;
  /** DOM ref for the preview iframe so we can update its srcdoc. */
  private previewIframe?: HTMLIFrameElement;
  /** Debounce timer for the preview re-render. */
  private previewTimer: number | null = null;
  /** v0.11.59: zoom level for the preview iframe (0.1–1.0). Persisted in localStorage. */
  private previewZoom: number = 0.4;
  /** DOM ref for the zoom-level readout. */
  private previewZoomLabel?: HTMLSpanElement;

  constructor(
    app: App,
    currentTheme: string,
    onSubmit: (options: PdfExportOptions | null) => void,
    renderPreview?: (options: PdfExportOptions, zoom: number) => Promise<string>
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.currentTheme = currentTheme;
    this.renderPreview = renderPreview;
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

    // v0.11.57: live preview pane. Sandboxed iframe that renders
    // the deck through the export pipeline with the currently-
    // selected options. v0.11.59: with a zoom slider so the user
    // can dial in 1-page-at-a-glance vs see-multiple-pages.
    if (this.renderPreview) {
      // Restore persisted zoom (if any).
      const storedZoom = parseFloat(window.localStorage.getItem("slides-ng-pdf-preview-zoom") ?? "");
      if (Number.isFinite(storedZoom) && storedZoom > 0.05 && storedZoom <= 1.5) {
        this.previewZoom = storedZoom;
      }

      const previewWrap = contentEl.createDiv({ cls: "slides-ng-export-pdf-preview" });

      const previewHeader = previewWrap.createDiv({ cls: "slides-ng-export-pdf-preview-header" });
      previewHeader.createEl("div", {
        cls: "slides-ng-export-pdf-preview-label",
        text: "Live preview",
      });

      const zoomGroup = previewHeader.createDiv({ cls: "slides-ng-export-pdf-preview-zoom" });
      const zoomOut = zoomGroup.createEl("button", {
        cls: "slides-ng-export-pdf-preview-zoom-btn",
        text: "−",
        attr: { type: "button", title: "Zoom out" },
      });
      const zoomSlider = zoomGroup.createEl("input", {
        cls: "slides-ng-export-pdf-preview-zoom-slider",
        attr: {
          type: "range",
          min: "10",
          max: "100",
          step: "5",
          value: String(Math.round(this.previewZoom * 100)),
          title: "Preview zoom",
        },
      });
      const zoomIn = zoomGroup.createEl("button", {
        cls: "slides-ng-export-pdf-preview-zoom-btn",
        text: "+",
        attr: { type: "button", title: "Zoom in" },
      });
      this.previewZoomLabel = zoomGroup.createEl("span", {
        cls: "slides-ng-export-pdf-preview-zoom-readout",
        text: `${Math.round(this.previewZoom * 100)}%`,
      });

      const applyZoom = (zoom: number) => {
        this.previewZoom = Math.max(0.1, Math.min(1.0, zoom));
        zoomSlider.value = String(Math.round(this.previewZoom * 100));
        if (this.previewZoomLabel) {
          this.previewZoomLabel.textContent = `${Math.round(this.previewZoom * 100)}%`;
        }
        window.localStorage.setItem("slides-ng-pdf-preview-zoom", String(this.previewZoom));
        this.schedulePreviewRefresh();
      };
      zoomSlider.addEventListener("input", (e) => {
        const v = parseInt((e.target as HTMLInputElement).value, 10);
        if (Number.isFinite(v)) applyZoom(v / 100);
      });
      zoomOut.addEventListener("click", () => applyZoom(this.previewZoom - 0.05));
      zoomIn.addEventListener("click", () => applyZoom(this.previewZoom + 0.05));

      this.previewIframe = previewWrap.createEl("iframe", {
        cls: "slides-ng-export-pdf-preview-iframe",
        attr: { sandbox: "allow-scripts", title: "PDF preview" },
      });
      // Kick off initial render after the modal lays out.
      window.setTimeout(() => this.schedulePreviewRefresh(), 50);
      // Bubble-listen for any user interaction so we don\'t have
      // to wire `schedulePreviewRefresh()` into every individual
      // option\'s onChange handler. Both `input` (for text fields)
      // and `change` (for dropdowns/toggles) cover the set. We
      // skip the zoom slider so its native `input` events don\'t
      // double-trigger (applyZoom already calls schedulePreviewRefresh).
      const refresh = (ev: Event) => {
        if (ev.target === zoomSlider) return;
        this.schedulePreviewRefresh();
      };
      contentEl.addEventListener("change", refresh);
      contentEl.addEventListener("input", refresh);
    }

    new Setting(contentEl)
      .setName("Layout")
      .setDesc(
        "Slides: full-page slide cards with theme styling (notes ~30% of page when included). Slides + notes emphasis: small slide at the top, notes fill the rest — for lecture handouts. Document: flowing handout, no slide chrome."
      )
      .addDropdown((d) => {
        d.addOption("slides", "Slides (cards with theme)");
        d.addOption("slides-notes", "Slides + notes emphasis (small slide, big notes)");
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
      .setName("Slide aspect ratio")
      .setDesc(
        "Shape of the slide content itself (the dark slide card in handout mode), NOT the printed page. The page is always determined by 'Page size' below. 'Current' uses the deck's authored dimensions."
      )
      .addDropdown((d) => {
        d.addOption("current", "Current (deck default)");
        d.addOption("16:9", "16:9 widescreen (1280×720)");
        d.addOption("4:3", "4:3 traditional (1024×768)");
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

    // ---------- Experimental options (v0.11.46) ----------
    new Setting(contentEl).setName("Experimental").setHeading();

    new Setting(contentEl)
      .setName("Auto-shrink overflowing slides")
      .setDesc(
        "Measure each slide's natural content height and scale its font down if the content is taller than the slide-card area. Best-effort — code blocks and images may not scale cleanly."
      )
      .addToggle((t) => {
        t.setValue(!!this.options.autoShrink).onChange((v) => {
          this.options.autoShrink = v;
        });
      });

    new Setting(contentEl)
      .setName("Page size")
      .setDesc("Override the paper size used by the browser print dialog.")
      .addDropdown((d) => {
        d.addOption("current", "Current (browser default)");
        d.addOption("a4", "A4 (210×297 mm)");
        d.addOption("letter", "Letter (8.5×11 in)");
        d.addOption("legal", "Legal (8.5×14 in)");
        d.setValue(this.options.pageSize ?? "current").onChange((v) => {
          this.options.pageSize = v as PdfExportOptions["pageSize"];
        });
      });

    new Setting(contentEl)
      .setName("Page margin")
      .setDesc("@page margin override. None = edge-to-edge slides.")
      .addDropdown((d) => {
        d.addOption("normal", "Normal (0.75 in)");
        d.addOption("narrow", "Narrow (0.4 in)");
        d.addOption("wide", "Wide (1.25 in)");
        d.addOption("none", "None (edge-to-edge)");
        d.setValue(this.options.pageMargin ?? "normal").onChange((v) => {
          this.options.pageMargin = v as PdfExportOptions["pageMargin"];
        });
      });

    new Setting(contentEl)
      .setName("Grayscale")
      .setDesc("Render the PDF in grayscale (CSS filter). For B&W printers.")
      .addToggle((t) => {
        t.setValue(!!this.options.grayscale).onChange((v) => {
          this.options.grayscale = v;
        });
      });

    new Setting(contentEl)
      .setName("Hide slide backgrounds")
      .setDesc(
        "Drop per-slide background colors / images so each page prints on white. Saves ink for dark-themed decks."
      )
      .addToggle((t) => {
        t.setValue(!!this.options.hideBackgrounds).onChange((v) => {
          this.options.hideBackgrounds = v;
        });
      });

    new Setting(contentEl)
      .setName("Slide number stamp")
      .setDesc("Print 'Slide N / M' in the top-right corner of each page.")
      .addToggle((t) => {
        t.setValue(!!this.options.slideNumberStamp).onChange((v) => {
          this.options.slideNumberStamp = v;
        });
      });

    new Setting(contentEl)
      .setName("Page header text")
      .setDesc("Optional text printed at the top of every page. Empty = none.")
      .addText((t) => {
        t.setValue(this.options.headerText ?? "")
          .setPlaceholder("e.g. CS-101 Lecture 5")
          .onChange((v) => {
            this.options.headerText = v;
          });
      });

    new Setting(contentEl)
      .setName("Page footer text")
      .setDesc("Optional text printed at the bottom of every page. Empty = none.")
      .addText((t) => {
        t.setValue(this.options.footerText ?? "")
          .setPlaceholder("e.g. Draft — do not distribute")
          .onChange((v) => {
            this.options.footerText = v;
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
    if (this.previewTimer !== null) {
      window.clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    this.contentEl.empty();
  }

  /**
   * v0.11.57: debounced live-preview refresh. Re-renders the deck
   * with the currently-selected options and pumps the resulting
   * HTML into the preview iframe\'s srcdoc.
   */
  private schedulePreviewRefresh(): void {
    if (!this.renderPreview || !this.previewIframe) return;
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(async () => {
      this.previewTimer = null;
      if (!this.renderPreview || !this.previewIframe) return;
      try {
        const html = await this.renderPreview(this.options, this.previewZoom);
        this.previewIframe.srcdoc = html;
      } catch (err) {
        // Failure here shouldn\'t break the modal — just log.
        // eslint-disable-next-line no-console
        console.warn("[slides-ng] PDF preview render failed", err);
      }
    }, 350);
  }
}
