/**
 * v0.11.73: deterministic, dependency-free contrast check for PDF
 * export. Pure-functional — no DOM walk, no async, no extra render.
 *
 * Resolves the effective foreground / background colors from the
 * deck theme + export-modal options, then runs the WCAG 2.1
 * relative-luminance ratio. Returns a list of warnings (zero or one
 * for now — we sample one representative pair per export) which the
 * caller surfaces as a Notice before opening the PDF window.
 *
 * Limitations (by design — lightweight):
 *  - Does not inspect per-slide `data-background` or per-slide
 *    frontmatter color overrides.
 *  - Does not inspect inline `<span style="color: …">` in markdown.
 *  - Covers the single global combination most exports use, which is
 *    where the common failure mode ("white text on white slide-card
 *    after hide-backgrounds") shows up.
 */

import type { PdfExportOptions } from "./exportStandalone";

interface ThemeColors {
  bg: string;
  text: string;
}

/** Hardcoded swatches pulled from each reveal theme\'s --r-background-color / --r-main-color. */
const THEME_COLORS: Record<string, ThemeColors> = {
  black:                              { bg: "#191919", text: "#ffffff" },
  "black-contrast":                   { bg: "#000000", text: "#ffffff" },
  blood:                              { bg: "#222222", text: "#eeeeee" },
  dracula:                            { bg: "#282a36", text: "#f8f8f2" },
  league:                             { bg: "#2b2b2b", text: "#eeeeee" },
  moon:                               { bg: "#002b36", text: "#93a1a1" },
  night:                              { bg: "#111111", text: "#eeeeee" },
  beige:                              { bg: "#f7f3de", text: "#333333" },
  serif:                              { bg: "#f0f1eb", text: "#000000" },
  simple:                             { bg: "#ffffff", text: "#000000" },
  sky:                                { bg: "#f7fbfc", text: "#333333" },
  solarized:                          { bg: "#fdf6e3", text: "#657b83" },
  white:                              { bg: "#ffffff", text: "#222222" },
  "white-contrast":                   { bg: "#ffffff", text: "#000000" },
  white_contrast_compact_verbatim_headers: { bg: "#ffffff", text: "#000000" },
};

export interface ContrastWarning {
  /** Human-readable description, ready to show in a Notice. */
  message: string;
  /** Computed contrast ratio (low = bad). */
  ratio: number;
  /** Effective foreground / background hex, for debugging. */
  fg: string;
  bg: string;
}

/**
 * Compute the warning (if any) for the given export options.
 * Returns `null` when contrast is acceptable.
 */
export function checkPdfExportContrast(
  options: PdfExportOptions,
  deckTheme: string,
): ContrastWarning | null {
  const themeName = options.themeOverride ?? deckTheme ?? "black";
  const theme = THEME_COLORS[themeName] ?? THEME_COLORS["black"];

  let bg = theme.bg;
  let fg = theme.text;

  // hideBackgrounds drops the page bg to white. The render template
  // also re-colors text to dark (#222) so it stays legible — mirror
  // that here so we don\'t false-flag.
  if (options.hideBackgrounds) {
    bg = "#ffffff";
    fg = "#222222";
  }

  // Notes-emphasis: the slide-card itself is the area where the
  // theme bg + text apply. That\'s what we already evaluated above.
  // No adjustment needed.

  // Document mode (page IS slide): same theme bg + text as plain
  // slides. No adjustment needed.

  const ratio = contrastRatio(fg, bg);
  if (ratio >= 3.0) return null; // Pass — visible enough for headings, body usually fine too.

  const equal = normaliseHex(fg) === normaliseHex(bg);
  const message = equal
    ? `PDF export warning: text and background are the same colour (${fg}). All text will be invisible. Disable "Hide slide backgrounds" or pick a different theme override.`
    : `PDF export warning: low text/background contrast (${ratio.toFixed(2)}:1, theme "${themeName}"${options.hideBackgrounds ? " + Hide backgrounds" : ""}). Text may be hard or impossible to read.`;

  return { message, ratio, fg, bg };
}

// ---------- WCAG luminance + ratio (pure functions) ----------

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  let s = hex.trim().replace(/^#/, "").toLowerCase();
  if (s.length === 3) {
    s = s.split("").map((c) => c + c).join("");
  }
  if (s.length !== 6 || !/^[0-9a-f]{6}$/.test(s)) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

function normaliseHex(hex: string): string {
  const { r, g, b } = parseHex(hex);
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
