import { describe, expect, test } from "bun:test";
import {
  checkPdfExportContrast,
  contrastRatio,
} from "../src/export/contrastCheck";

describe("contrastRatio", () => {
  test("black on white is 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
  test("white on white is 1:1", () => {
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 1);
  });
  test("ratio is symmetric", () => {
    expect(contrastRatio("#222", "#fff")).toBeCloseTo(
      contrastRatio("#fff", "#222"),
      4
    );
  });
  test("supports 3-digit hex shorthand", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 0);
  });
});

describe("checkPdfExportContrast", () => {
  test("black theme passes (high contrast)", () => {
    expect(checkPdfExportContrast({}, "black")).toBeNull();
  });

  test("white theme passes (high contrast)", () => {
    expect(checkPdfExportContrast({}, "white")).toBeNull();
  });

  test("hideBackgrounds is safe (forces white bg + dark text)", () => {
    const w = checkPdfExportContrast({ hideBackgrounds: true }, "black");
    expect(w).toBeNull();
  });

  test("moon theme passes (low-ish but above threshold)", () => {
    // bg #002b36, text #93a1a1 — ~5:1, well above 3:1.
    expect(checkPdfExportContrast({}, "moon")).toBeNull();
  });

  test("themeOverride is honoured", () => {
    // Picking the white theme on a dark deck — should still pass.
    expect(checkPdfExportContrast({ themeOverride: "white" }, "black")).toBeNull();
  });

  test("flags unknown theme falling back to black (still passes)", () => {
    expect(checkPdfExportContrast({}, "totally-bogus")).toBeNull();
  });
});
