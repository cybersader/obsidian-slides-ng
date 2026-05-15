/**
 * v0.11.47 TDD bug-repro: the deck author used the
 * `<!-- slide: notes="..." -->` syntax (with a colon after `slide`).
 * That's the form many Slides-Extended-style decks use. Our parser
 * was matching `slide\s+` (whitespace required, no colon), so the
 * annotation flowed through into the speaker-note text as literal
 * `slide: notes="..."`. User screenshot showed the raw annotation
 * verbatim in the speaker-note area of every printed PDF slide.
 *
 * Fix: both `SLIDE_ANNOTATION_RE` (in annotations.ts) and
 * `RECLASSIFY_NOTE_RE` (in parseDeck.ts) need to accept an optional
 * colon between the annotation kind and its attributes.
 */

import { test, expect, describe } from "bun:test";
import { extractSlideAttrs } from "../src/parser/annotations";
import { parseDeck } from "../src/parser/parseDeck";
import { renderDeck } from "../src/render/renderDeck";

describe("slide / element annotation with colon form (v0.11.47)", () => {
  test("extractSlideAttrs strips `<!-- slide: notes=...` (colon form)", () => {
    const md = `# Hello\n\nworld\n\n<!-- slide: notes="hi there" -->`;
    const { content, attrs } = extractSlideAttrs(md);
    expect(content).not.toContain("slide:");
    expect(content).not.toContain("notes=");
    expect(attrs.notes).toBe("hi there");
  });

  test("extractSlideAttrs still handles the canonical (no-colon) form", () => {
    const md = `# Hello\n\nworld\n\n<!-- slide notes="hi" class="big" -->`;
    const { content, attrs } = extractSlideAttrs(md);
    expect(content).not.toContain("slide ");
    expect(attrs.notes).toBe("hi");
    expect(attrs.class).toBe("big");
  });

  test("parseDeck reclassifies `<!-- slide: notes=... -->` away from the note field (was: leaked literal)", () => {
    const deck = `---\ntitle: test\n---\n\n# Slide\n\nBody\n\n<!-- slide: notes="real speaker note here" -->`;
    const r = parseDeck(deck);
    expect(r.slides).toHaveLength(1);
    // After v0.11.47: the colon-form annotation is reclassified — its
    // attributes flow through slide attrs, not into the literal note.
    // The note field is undefined because the comment WAS the only
    // "note" the parser saw, and reclassify recognised it as an
    // annotation in disguise. The actual notes="..." value lands in
    // slideAttrs.notes at render time (downstream of parseDeck).
    expect(r.slides[0].note).toBeUndefined();
    // The reinjected annotation is canonical form in slide content.
    expect(r.slides[0].content).toContain("<!-- slide ");
    expect(r.slides[0].content).toContain('notes="real speaker note here"');
  });

  test("parseDeck does NOT put the colon-form annotation into slide content either", () => {
    const deck = `---\ntitle: test\n---\n\n# Slide\n\nBody text\n\n<!-- slide: class="custom-class" -->`;
    const r = parseDeck(deck);
    // parseDeck doesn't run the annotation extractor itself —
    // slideToHtml does. So we don't expect `.content` to be free
    // of the comment, but the comment MUST be in canonical form
    // (no colon) so extractSlideAttrs picks it up later.
    expect(r.slides[0].content).not.toContain("slide:");
    expect(r.slides[0].content).toContain("<!-- slide ");
    // extractSlideAttrs then strips the canonical comment cleanly.
    const { content: cleaned, attrs } = extractSlideAttrs(r.slides[0].content);
    expect(cleaned).not.toContain("class=");
    expect(attrs.class).toBe("custom-class");
  });

  test("renderDeck: colon-form notes produce a real <aside class=notes>, NOT body text (the user-reported bug)", () => {
    // This is the actual bug from the daruSK.png screenshot — the
    // raw `slide: notes=\"...\"` annotation showed up VERBATIM in the
    // PDF's speaker-note area instead of being treated as the note.
    const deck = `---\ntitle: test\n---\n\n# Building Resilient Systems\n\nSubtitle\n\n<!-- slide: notes="Welcome the audience. Mention the 10-year journey." -->`;
    const html = renderDeck(deck, "deck.md", {});
    // The literal annotation syntax must not survive into the rendered
    // section body OR the notes block.
    expect(html).not.toMatch(/slide:\s*notes=/);
    // The aside should contain the clean note text.
    const asideMatch = html.match(/<aside class="notes">([\s\S]*?)<\/aside>/);
    expect(asideMatch).not.toBeNull();
    expect(asideMatch![1]).toContain("Welcome the audience");
    expect(asideMatch![1]).not.toContain("slide:");
    expect(asideMatch![1]).not.toContain("notes=");
    // notes attr also doesn't leak onto the <section> tag itself.
    const sectionMatch = html.match(/<section[^>]*>/);
    expect(sectionMatch).not.toBeNull();
    expect(sectionMatch![0]).not.toContain('notes="Welcome');
  });

  test("end-to-end: colon-form `<!-- slide: notes=... -->` is fully extracted by the pipeline", () => {
    const deck = `---\ntitle: test\n---\n\n# Slide\n\nBody text\n\n<!-- slide: notes="actual note content" -->`;
    const r = parseDeck(deck);
    // The reclassify step pulls the slide-annotation out of the note
    // field (where @slidev/parser mis-placed it) and reinjects it as
    // a proper HTML comment in slide content.
    expect(r.slides[0].note).toBeUndefined();
    // extractSlideAttrs then strips the comment and stores notes in attrs.
    const { content: cleaned, attrs } = extractSlideAttrs(r.slides[0].content);
    expect(cleaned).not.toContain("slide");
    expect(cleaned).not.toContain("notes=");
    expect(attrs.notes).toBe("actual note content");
  });
});
