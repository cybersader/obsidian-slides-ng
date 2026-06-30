import { describe, expect, test } from "bun:test";
import {
  parseEmbedInner,
  buildImgTag,
  preprocessObsidianImageEmbeds,
} from "../src/parser/obsidianEmbeds";

describe("parseEmbedInner", () => {
  test("plain image embed", () => {
    expect(parseEmbedInner("image.png")).toEqual({ linkpath: "image.png", alt: "" });
  });
  test("width-only size suffix", () => {
    expect(parseEmbedInner("image.png|300")).toEqual({
      linkpath: "image.png",
      alt: "",
      width: 300,
    });
  });
  test("width x height size suffix", () => {
    expect(parseEmbedInner("image.png|300x200")).toEqual({
      linkpath: "image.png",
      alt: "",
      width: 300,
      height: 200,
    });
  });
  test("non-numeric suffix becomes alt text", () => {
    expect(parseEmbedInner("image.png|a nice caption")).toEqual({
      linkpath: "image.png",
      alt: "a nice caption",
    });
  });
  test("folder path is preserved", () => {
    expect(parseEmbedInner("assets/sub/pic.jpg")?.linkpath).toBe("assets/sub/pic.jpg");
  });
  test("#subpath is stripped", () => {
    expect(parseEmbedInner("image.png#anchor")?.linkpath).toBe("image.png");
  });
  test("non-image extension → null (left untouched)", () => {
    expect(parseEmbedInner("note")).toBeNull();
    expect(parseEmbedInner("document.pdf")).toBeNull();
    expect(parseEmbedInner("clip.mp4")).toBeNull();
  });
  test("ico/apng → null (not in Obsidian's image-embed set)", () => {
    // Obsidian does NOT treat .ico / .apng as embeddable images.
    expect(parseEmbedInner("favicon.ico")).toBeNull();
    expect(parseEmbedInner("anim.apng")).toBeNull();
  });
  test("all common image extensions recognised", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp"]) {
      expect(parseEmbedInner(`x.${ext}`)).not.toBeNull();
    }
  });
  test("uppercase extension recognised", () => {
    expect(parseEmbedInner("PHOTO.PNG")).not.toBeNull();
  });
  test("whitespace around path trimmed", () => {
    expect(parseEmbedInner("  image.png  ")?.linkpath).toBe("image.png");
  });
});

describe("buildImgTag", () => {
  test("basic src + alt", () => {
    expect(buildImgTag({ src: "x.png", alt: "hi" })).toBe(
      '<img class="slides-ng-embed" src="x.png" alt="hi">'
    );
  });
  test("width + height attributes", () => {
    expect(buildImgTag({ src: "x.png", width: 300, height: 200 })).toBe(
      '<img class="slides-ng-embed" src="x.png" alt="" width="300" height="200">'
    );
  });
  test("escapes quotes and angle brackets in attributes", () => {
    const out = buildImgTag({ src: 'a"b', alt: "<script>" });
    expect(out).not.toContain('"a"b"'); // src quote escaped
    expect(out).toContain("&quot;");
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script>");
  });
});

describe("preprocessObsidianImageEmbeds", () => {
  test("replaces embed with resolved <img>", () => {
    const out = preprocessObsidianImageEmbeds("![[pic.png]]", () => "app://x/pic.png");
    expect(out).toBe('<img class="slides-ng-embed" src="app://x/pic.png" alt="">');
  });
  test("uses raw linkpath when resolver returns null", () => {
    const out = preprocessObsidianImageEmbeds("![[pic.png]]", () => null);
    expect(out).toContain('src="pic.png"');
    expect(out).toContain("<img");
    expect(out).not.toContain("![[");
  });
  test("works with no resolver supplied", () => {
    const out = preprocessObsidianImageEmbeds("![[pic.png]]");
    expect(out).toContain('src="pic.png"');
  });
  test("carries width/height into the tag", () => {
    const out = preprocessObsidianImageEmbeds("![[pic.png|320x240]]", (p) => "R:" + p);
    expect(out).toContain('src="R:pic.png"');
    expect(out).toContain('width="320"');
    expect(out).toContain('height="240"');
  });
  test("non-image embed left untouched", () => {
    expect(preprocessObsidianImageEmbeds("![[my note]]")).toBe("![[my note]]");
    expect(preprocessObsidianImageEmbeds("![[file.pdf]]")).toBe("![[file.pdf]]");
  });
  test("multiple embeds on one line both replaced", () => {
    const out = preprocessObsidianImageEmbeds("![[a.png]] and ![[b.png]]", (p) => "R:" + p);
    expect(out).toContain('src="R:a.png"');
    expect(out).toContain('src="R:b.png"');
    expect(out).not.toContain("![[");
  });
  test("embed inside other text + markdown preserved", () => {
    const out = preprocessObsidianImageEmbeds(
      "# Heading\n\nText ![[pic.png]] more text\n",
      () => "URL"
    );
    expect(out).toContain("# Heading");
    expect(out).toContain("more text");
    expect(out).toContain('src="URL"');
  });
  test("standard markdown image NOT touched (handled by renderer)", () => {
    const src = "![alt](relative/x.png)";
    expect(preprocessObsidianImageEmbeds(src, () => "R")).toBe(src);
  });
  test("resolver receives the bare linkpath (no brackets/size)", () => {
    const seen: string[] = [];
    preprocessObsidianImageEmbeds("![[folder/pic.png|200]]", (p) => {
      seen.push(p);
      return p;
    });
    expect(seen).toEqual(["folder/pic.png"]);
  });

  // v0.13.3: embeds inside code regions must NOT be expanded (Obsidian
  // shows them literally). Workflow-confirmed defect.
  test("embed inside a fenced code block is left literal", () => {
    const src = "```\nUse ![[diagram.png]] to embed\n```";
    const out = preprocessObsidianImageEmbeds(src, () => "R");
    expect(out).toBe(src);
    expect(out).not.toContain("<img");
  });
  test("embed inside ~~~ fenced block is left literal", () => {
    const src = "~~~\n![[x.png]]\n~~~";
    expect(preprocessObsidianImageEmbeds(src, () => "R")).toBe(src);
  });
  test("embed inside an inline code span is left literal", () => {
    const src = "Inline `![[secret.png]]` here";
    expect(preprocessObsidianImageEmbeds(src, () => "R")).toBe(src);
  });
  test("real embed outside code expands while code-fenced one stays literal", () => {
    const src = "![[real.png]]\n\n```\n![[fake.png]]\n```";
    const out = preprocessObsidianImageEmbeds(src, (p) => "R:" + p);
    expect(out).toContain('src="R:real.png"');
    expect(out).toContain("![[fake.png]]"); // untouched inside fence
    expect(out).not.toContain("R:fake.png");
  });
});
