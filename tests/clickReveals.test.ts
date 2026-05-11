import { test, expect, describe } from "bun:test";
import { applyClickReveals } from "../src/render/clickReveals";

describe("applyClickReveals", () => {
  test("<v-click>X</v-click> → <span class=\"fragment\">X</span>", () => {
    const out = applyClickReveals("<p><v-click>hello</v-click></p>");
    expect(out).toContain('<span class="fragment">hello</span>');
    expect(out).not.toContain("<v-click");
  });

  test("multiple <v-click> tags on the same slide", () => {
    const out = applyClickReveals(
      "<p><v-click>a</v-click> and <v-click>b</v-click></p>"
    );
    const matches = out.match(/<span class="fragment">/g) ?? [];
    expect(matches.length).toBe(2);
  });

  test("<v-clicks> adds .fragment to each <li>", () => {
    const html = `<v-clicks>
<ul>
<li>First</li>
<li>Second</li>
<li>Third</li>
</ul>
</v-clicks>`;
    const out = applyClickReveals(html);
    const matches = out.match(/<li class="fragment">/g) ?? [];
    expect(matches.length).toBe(3);
    expect(out).not.toContain("<v-clicks");
  });

  test("<v-clicks> on paragraphs adds .fragment to each <p>", () => {
    const html = "<v-clicks>\n<p>One</p>\n<p>Two</p>\n</v-clicks>";
    const out = applyClickReveals(html);
    const matches = out.match(/<p class="fragment">/g) ?? [];
    expect(matches.length).toBe(2);
  });

  test("<v-clicks> preserves existing class on <li>", () => {
    const html = '<v-clicks><li class="special">A</li></v-clicks>';
    const out = applyClickReveals(html);
    expect(out).toContain('class="special fragment"');
  });

  test("leaves non-Slidev HTML untouched", () => {
    const html = "<h1>Title</h1>\n<p>Body</p>";
    expect(applyClickReveals(html)).toBe(html);
  });

  test("<v-click> with attribute is still translated", () => {
    const out = applyClickReveals('<v-click at="2">X</v-click>');
    expect(out).toContain('<span class="fragment">X</span>');
  });
});
