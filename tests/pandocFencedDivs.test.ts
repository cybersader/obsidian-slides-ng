import { describe, expect, test } from "bun:test";
import { Marked } from "marked";
import { pandocFencedDivs, parseFencedDivHeader } from "../src/parser/pandocFencedDivs";

function md(input: string): string {
  const m = new Marked();
  m.use(pandocFencedDivs);
  return (m.parse(input) as string).trim();
}

describe("parseFencedDivHeader", () => {
  test("empty header → no attrs", () => {
    expect(parseFencedDivHeader("")).toEqual({ classes: [], id: null, attrs: {} });
  });
  test("shorthand class name", () => {
    expect(parseFencedDivHeader("hero")).toEqual({ classes: ["hero"], id: null, attrs: {} });
  });
  test("class with dashes", () => {
    expect(parseFencedDivHeader("my-callout")).toEqual({
      classes: ["my-callout"], id: null, attrs: {},
    });
  });
  test("bracketed: classes + id + attrs", () => {
    expect(parseFencedDivHeader('{ .a .b #my-id k="quoted val" k2=simple }')).toEqual({
      classes: ["a", "b"],
      id: "my-id",
      attrs: { k: "quoted val", k2: "simple" },
    });
  });
  test("bracketed: only attrs", () => {
    expect(parseFencedDivHeader('{ data-test="1" }')).toEqual({
      classes: [], id: null, attrs: { "data-test": "1" },
    });
  });
  test("invalid header → empty attrs (but div still gets created)", () => {
    expect(parseFencedDivHeader("not valid because spaces")).toEqual({
      classes: [], id: null, attrs: {},
    });
  });
});

describe("pandocFencedDivs marked extension", () => {
  test("simple class-named div renders with class attribute", () => {
    const out = md("::: hero\n\nbody\n\n:::");
    expect(out).toContain('<div class="hero">');
    expect(out).toContain("<p>body</p>");
    expect(out).toContain("</div>");
  });

  test("inner markdown is parsed as markdown", () => {
    const out = md(
      "::: callout\n\n# Heading\n\n- bullet 1\n- bullet 2\n\n**bold**\n\n:::"
    );
    expect(out).toContain('<div class="callout">');
    expect(out).toContain("<h1>Heading</h1>");
    expect(out).toContain("<li>bullet 1</li>");
    expect(out).toContain("<strong>bold</strong>");
  });

  test("bracketed header: classes + id + attrs", () => {
    const out = md('::: { .a .b #x data-k="v" }\n\nbody\n\n:::');
    expect(out).toContain('class="a b"');
    expect(out).toContain('id="x"');
    expect(out).toContain('data-k="v"');
  });

  test("attrs are alphabetised after class+id for stable output", () => {
    const out = md('::: { .x data-b="2" data-a="1" }\n\nbody\n\n:::');
    // class first, then alphabetised attrs
    expect(out).toMatch(/class="x" data-a="1" data-b="2"/);
  });

  test("nested 3+colons inside 4+colons", () => {
    const out = md([
      ":::: outer",
      "",
      "outside body",
      "",
      "::: inner",
      "",
      "inside body",
      "",
      ":::",
      "",
      "::::",
    ].join("\n"));
    expect(out).toContain('<div class="outer">');
    expect(out).toContain('<div class="inner">');
    expect(out).toContain("<p>outside body</p>");
    expect(out).toContain("<p>inside body</p>");
    // Inner div is closed BEFORE outer div is closed
    const innerOpen = out.indexOf('<div class="inner">');
    const innerClose = out.indexOf("</div>", innerOpen);
    const outerClose = out.lastIndexOf("</div>");
    expect(innerClose).toBeLessThan(outerClose);
  });

  test("unmatched open fence: not parsed as fenced div", () => {
    const out = md("::: hero\n\nbody without close");
    expect(out).not.toContain('<div class="hero">');
  });

  test("regular markdown without fenced divs is unaffected", () => {
    const out = md("# Heading\n\nParagraph **bold**.\n\n- item");
    expect(out).toContain("<h1>Heading</h1>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).not.toContain("<div");
  });

  test("HTML-attribute escaping prevents injection", () => {
    const out = md('::: { .x data-q="</div><script>alert(1)</script>" }\n\nbody\n\n:::');
    // The dangerous payload must be neutralised — no executable
    // <script> tag and no premature </div>.
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });
});
