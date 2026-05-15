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
   * v0.11.57: render-preview callback (unused as of v0.11.61).
   * Kept in the type signature for backwards compat — the modal
   * now renders a static HTML mockup that visualises the chosen
   * options. The iframe + full-deck render approach was too
   * fragile (the popup speaker UI sometimes leaked into the
   * preview frame).
   */
  private renderPreview?: (options: PdfExportOptions, zoom: number) => Promise<string>;
  /** v0.11.61: DOM ref for the static-mockup preview container. */
  private previewMockup?: HTMLDivElement;
  /** Debounce timer for the preview redraw. */
  private previewTimer: number | null = null;
  /** v0.11.62: experimental iframe preview (opt-in via settings). */
  private experimentalIframe?: HTMLIFrameElement;
  private experimentalIframeEnabled: boolean = false;

  constructor(
    app: App,
    currentTheme: string,
    onSubmit: (options: PdfExportOptions | null) => void,
    renderPreview?: (options: PdfExportOptions, zoom: number) => Promise<string>,
    experimentalIframeEnabled?: boolean
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.currentTheme = currentTheme;
    this.renderPreview = renderPreview;
    this.experimentalIframeEnabled = !!experimentalIframeEnabled;
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

    // v0.11.61: STATIC mockup preview — a pure-DOM representation
    // of what one PDF page will look like with the chosen options.
    // No iframe, no script execution, no full-deck render. Gives
    // the user a mental model: "ah, slide card on top, big notes
    // block below, grayscale + slide-number stamp visible." The
    // earlier iframe-based live preview kept rendering the speaker
    // popup HTML by accident — too many moving parts.
    const previewWrap = contentEl.createDiv({ cls: "slides-ng-export-pdf-preview" });
    previewWrap.createEl("div", {
      cls: "slides-ng-export-pdf-preview-label",
      text: "Preview (mockup of one page)",
    });
    this.previewMockup = previewWrap.createDiv({ cls: "slides-ng-export-pdf-mockup" });

    // v0.11.62: experimental iframe live-render (opt-in via
    // Settings). Sits below the mockup. Re-rendered alongside the
    // mockup on every option change.
    if (this.experimentalIframeEnabled && this.renderPreview) {
      const expWrap = previewWrap.createDiv({ cls: "slides-ng-export-pdf-preview-experimental" });
      expWrap.createEl("div", {
        cls: "slides-ng-export-pdf-preview-experimental-label",
        text: "Experimental: live render (real export HTML)",
      });
      this.experimentalIframe = expWrap.createEl("iframe", {
        cls: "slides-ng-export-pdf-preview-iframe",
        attr: { sandbox: "allow-scripts", title: "PDF preview (live render)" },
      });
    }

    // Kick off initial draw.
    window.setTimeout(() => this.schedulePreviewRefresh(), 50);
    // Re-draw on any option change.
    const refresh = () => this.schedulePreviewRefresh();
    contentEl.addEventListener("change", refresh);
    contentEl.addEventListener("input", refresh);

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
   * v0.11.61: debounced redraw of the static-mockup preview. Pure
   * DOM, no iframe, no full-deck render. Produces a small Letter-
   * proportioned page outline with the slide-card / notes block /
   * margins / header / footer / grayscale / slide-number stamp
   * positioned to visualise the chosen layout.
   */
  private schedulePreviewRefresh(): void {
    if (!this.previewMockup) return;
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(async () => {
      this.previewTimer = null;
      if (this.previewMockup) {
        this.previewMockup.empty();
        this.previewMockup.appendChild(this.buildMockup());
      }
      // v0.11.62: also refresh the experimental iframe if enabled.
      if (this.experimentalIframe && this.renderPreview) {
        try {
          const html = await this.renderPreview(this.options, 0.4);
          this.experimentalIframe.srcdoc = html;
        } catch {
          /* ignore */
        }
      }
    }, 120);
  }

  /**
   * v0.11.61: build the static page-mockup DOM. Layout depends on
   * `pdfStyle`:
   *   slides         — full-page slide card with theme styling.
   *                    Notes block below if showNotes is on (~25%).
   *   slides-notes   — small slide card on top (~35%), big notes
   *                    block below (~55%).
   *   document       — flowing handout: section header, body lines,
   *                    notes inline. No slide card.
   * Page margins, grayscale, header/footer, slide-number stamp are
   * all visualised when their options are on.
   */
  private buildMockup(): HTMLElement {
    const opts = this.options;
    const page = document.createElement("div");
    page.className = "slides-ng-export-pdf-mockup-page";
    page.setAttribute("data-style", opts.pdfStyle ?? "slides");

    // v0.11.63: reflect page size in the mockup outline. Page sizes
    // have different aspect ratios, independent of slide aspect:
    //   Letter 8.5×11   → 0.773 (default)
    //   A4     210×297  → 0.707 (slightly taller)
    //   Legal  8.5×14   → 0.607 (much taller)
    // We hold WIDTH constant at 200px and adjust HEIGHT.
    const pageSizeMap: Record<string, number> = {
      letter: 260,        // 200 / 0.773
      a4: 283,            // 200 / 0.707
      legal: 330,         // 200 / 0.607
      current: 260,       // default = Letter
    };
    const pageHeight = pageSizeMap[opts.pageSize ?? "current"] ?? 260;
    page.style.height = `${pageHeight}px`;

    // Page-margin visualization — adjust inner padding.
    const margin = opts.pageMargin ?? "normal";
    page.classList.add(`mockup-margin-${margin}`);

    // Grayscale wrapper.
    if (opts.grayscale) page.classList.add("mockup-grayscale");

    // Page header strip (if forceHeaderText set).
    if (opts.headerText) {
      const h = document.createElement("div");
      h.className = "mockup-page-header";
      h.textContent = opts.headerText;
      page.appendChild(h);
    }

    // Inner content scaffolding depends on layout.
    const inner = document.createElement("div");
    inner.className = "mockup-page-inner";
    page.appendChild(inner);

    if (opts.pdfStyle === "document") {
      // Flowing document — section header + body + notes
      const heading = document.createElement("div");
      heading.className = "mockup-doc-heading";
      heading.textContent = "Building Resilient Systems";
      inner.appendChild(heading);
      const body = document.createElement("div");
      body.className = "mockup-doc-body";
      for (let i = 0; i < 4; i++) {
        const line = document.createElement("div");
        line.className = "mockup-line";
        body.appendChild(line);
      }
      inner.appendChild(body);
      if (opts.showNotes) {
        const notes = document.createElement("div");
        notes.className = "mockup-doc-notes";
        notes.appendChild(this.makeLabel("Notes"));
        for (let i = 0; i < 2; i++) {
          const line = document.createElement("div");
          line.className = "mockup-line mockup-line-notes";
          notes.appendChild(line);
        }
        inner.appendChild(notes);
      }
    } else {
      // Slides modes — render a slide card with theme styling.
      const isNotesEmphasis = opts.pdfStyle === "slides-notes";
      const card = document.createElement("div");
      const aspectClass = `mockup-slide-aspect-${(opts.aspectRatio ?? "current").replace(":", "-")}`;
      card.className = `mockup-slide-card ${aspectClass}`;
      if (isNotesEmphasis) card.classList.add("mockup-slide-card-small");
      // Theme override or "Current". Hide-backgrounds forces white.
      const themeName = opts.themeOverride ?? this.currentTheme ?? "black";
      card.setAttribute("data-theme", opts.hideBackgrounds ? "white" : themeName);
      // Slide content placeholder
      const title = document.createElement("div");
      title.className = "mockup-slide-title";
      title.textContent = "BUILDING RESILIENT SYSTEMS";
      card.appendChild(title);
      const subtitle = document.createElement("div");
      subtitle.className = "mockup-slide-subtitle";
      subtitle.textContent = "Lessons from running production for a decade";
      card.appendChild(subtitle);
      // Slide-number stamp.
      if (opts.slideNumberStamp) {
        const stamp = document.createElement("div");
        stamp.className = "mockup-slide-stamp";
        stamp.textContent = "Slide 1 / 12";
        card.appendChild(stamp);
      }
      // v0.11.62: auto-shrink visualization — when off, mark the
      // text as overflowing the card; when on, mark it shrunk.
      if (opts.autoShrink) {
        card.classList.add("mockup-slide-auto-shrink");
      }
      inner.appendChild(card);
      // Notes block — only if showNotes OR slides-notes mode.
      const showsNotes = isNotesEmphasis || opts.showNotes;
      if (showsNotes) {
        const notes = document.createElement("div");
        notes.className = isNotesEmphasis
          ? "mockup-notes mockup-notes-big"
          : "mockup-notes mockup-notes-small";
        notes.appendChild(this.makeLabel("Speaker notes"));
        const lineCount = isNotesEmphasis ? 6 : 3;
        for (let i = 0; i < lineCount; i++) {
          const line = document.createElement("div");
          line.className = "mockup-line mockup-line-notes";
          notes.appendChild(line);
        }
        inner.appendChild(notes);
      }
    }

    // Page footer strip.
    if (opts.footerText) {
      const f = document.createElement("div");
      f.className = "mockup-page-footer";
      f.textContent = opts.footerText;
      page.appendChild(f);
    }

    // v0.11.62: when maxPagesPerSlide > 1, show a 2nd page mockup
    // depicting the OVERFLOW continuing on the next page (with a
    // "(cont.)" marker). When = 1 (default), one page only — but
    // if the slide content overflows the card, show clipping.
    const wrap = document.createElement("div");
    wrap.className = "slides-ng-export-pdf-mockup-wrap";
    const pagesRow = document.createElement("div");
    pagesRow.className = "slides-ng-export-pdf-mockup-pages-row";
    pagesRow.appendChild(page);

    if (opts.maxPagesPerSlide && opts.maxPagesPerSlide > 1) {
      // Side-by-side continuation page mockup
      const cont = page.cloneNode(false) as HTMLDivElement;
      cont.classList.add("mockup-page-overflow-continued");
      const contInner = document.createElement("div");
      contInner.className = "mockup-page-inner";
      const contLabel = this.makeLabel("(cont.)");
      contInner.appendChild(contLabel);
      // Overflow body lines
      for (let i = 0; i < 8; i++) {
        const line = document.createElement("div");
        line.className = "mockup-line";
        contInner.appendChild(line);
      }
      cont.appendChild(contInner);
      pagesRow.appendChild(cont);
    }
    wrap.appendChild(pagesRow);

    const note = document.createElement("div");
    note.className = "slides-ng-export-pdf-mockup-summary";
    const layoutLabel = opts.pdfStyle === "slides-notes"
      ? "Slides + notes emphasis"
      : opts.pdfStyle === "document"
        ? "Document handout"
        : "Slides (cards with theme)";
    const bits = [layoutLabel];
    if (opts.aspectRatio && opts.aspectRatio !== "current") bits.push(opts.aspectRatio);
    if (opts.pageSize && opts.pageSize !== "current") bits.push(opts.pageSize.toUpperCase());
    if (opts.pageMargin && opts.pageMargin !== "normal") bits.push(`${opts.pageMargin} margin`);
    if (opts.grayscale) bits.push("grayscale");
    if (opts.hideBackgrounds) bits.push("no bg");
    if (opts.autoShrink) bits.push("auto-shrink");
    if (opts.maxPagesPerSlide && opts.maxPagesPerSlide > 1) bits.push(`max ${opts.maxPagesPerSlide} pgs/slide`);
    note.textContent = bits.join(" · ");
    wrap.appendChild(note);
    return wrap;
  }

  private makeLabel(text: string): HTMLElement {
    const l = document.createElement("div");
    l.className = "mockup-label";
    l.textContent = text;
    return l;
  }
}
