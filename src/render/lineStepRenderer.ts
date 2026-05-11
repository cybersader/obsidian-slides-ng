import type { ShikiTransformer } from "shiki/core";
import { type ParsedLineStep, type Step } from "../parser/lineStep";
import { highlight, highlightWithTransformers } from "./shiki";

/**
 * Render a Slidev-style line-stepping code block as a sequence of stacked
 * Shiki blocks, one per step. Reveal.js fragment classes advance through
 * them on click — CSS in `styles.css` (the `.line-step-container` rules)
 * stacks them via CSS grid and only shows the active one.
 *
 *   <div class="line-step-container" data-step-count="N" data-step-lang="ts">
 *     <div class="line-step-step" data-step-index="0">{shiki for step 0}</div>
 *     <div class="line-step-step fragment line-step-fade" data-step-index="1">{shiki for step 1}</div>
 *     ...
 *   </div>
 *
 * The first step has no `.fragment` class — it's visible on slide entry.
 * Subsequent steps are `.fragment line-step-fade` — they only appear when
 * reveal.js marks them `.visible.current-fragment`. The CSS hides step 0
 * once any later step is current.
 */
export function renderLineStep(code: string, parsed: ParsedLineStep): string {
  const { lang, steps } = parsed;

  const stepHtml = steps.map((step, idx) => {
    const inner = renderSingleStep(code, lang, step);
    const cls =
      idx === 0
        ? "line-step-step"
        : "line-step-step fragment line-step-fade";
    return (
      `<div class="${cls}" data-step-index="${idx}" data-step-raw="${escapeAttr(step.raw)}">` +
      inner +
      "</div>"
    );
  });

  return (
    `<div class="line-step-container" data-step-count="${steps.length}" ` +
    `data-step-lang="${escapeAttr(lang)}">` +
    stepHtml.join("") +
    "</div>"
  );
}

function renderSingleStep(code: string, lang: string, step: Step): string {
  if (step.lines === null) {
    // 'all' / '*' — full highlight, no dimming.
    return highlight(code, lang);
  }
  const keep = step.lines;
  const transformer: ShikiTransformer = {
    name: "slides-ng:line-dim",
    line(node, lineNumber1Based) {
      if (!keep.has(lineNumber1Based)) {
        const existing = (node.properties.class as string | undefined) ?? "";
        node.properties.class = (existing + " line-dim").trim();
      }
      return node;
    },
  };
  return highlightWithTransformers(code, lang, [transformer]);
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
