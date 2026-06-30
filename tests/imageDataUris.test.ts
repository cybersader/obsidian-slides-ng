import { describe, expect, test } from "bun:test";
import {
  collectImageTargets,
  mimeForExtension,
  arrayBufferToBase64,
  buildImageDataUriResolver,
  type AppLike,
} from "../src/export/imageDataUris";

describe("collectImageTargets", () => {
  test("collects Obsidian embeds and markdown images", () => {
    const md = [
      "# Slide",
      "![[a.png]]",
      "![alt](b.jpg)",
      "![[sub/c.gif|200]]",
      "text ![[d.webp]] inline",
    ].join("\n");
    const t = collectImageTargets(md).sort();
    expect(t).toEqual(["a.png", "b.jpg", "d.webp", "sub/c.gif"]);
  });
  test("excludes remote + data + file URLs", () => {
    const md = "![x](https://e.com/x.png)\n![[data:foo]]\n![y](file:///z.png)";
    expect(collectImageTargets(md)).toEqual([]);
  });
  test("strips size + subpath from embed targets", () => {
    expect(collectImageTargets("![[pic.png|300x200]]")).toEqual(["pic.png"]);
    expect(collectImageTargets("![[pic.png#frag]]")).toEqual(["pic.png"]);
  });
  test("de-duplicates repeated targets", () => {
    expect(collectImageTargets("![[a.png]]\n![[a.png|50]]\n![](a.png)")).toEqual([
      "a.png",
    ]);
  });
  test("non-image embeds ignored", () => {
    expect(collectImageTargets("![[note]]\n![[doc.pdf]]")).toEqual([]);
  });
  test("keeps percent-encoded markdown hrefs raw (matches marked token.href)", () => {
    // marked passes token.href un-decoded to the renderer, so the
    // collected key must stay encoded to match at resolve time.
    expect(collectImageTargets("![a](my%20pic.png)")).toEqual(["my%20pic.png"]);
  });
  test("encoded href resolves via decoded vault lookup + dual-keyed map", async () => {
    const app: AppLike = {
      vault: {
        async read() {
          return "![a](my%20pic.png)";
        },
        adapter: {
          async readBinary() {
            return new Uint8Array([1, 2, 3]).buffer;
          },
        },
        getAbstractFileByPath(p: string) {
          return p === "my pic.png" ? { path: "my pic.png" } : null;
        },
      },
      metadataCache: { getFirstLinkpathDest: () => null },
    };
    const resolve = await buildImageDataUriResolver(app, { path: "deck.md" });
    // Both the encoded form (markdown renderer) and decoded form
    // (embed preprocessor) resolve to the same data URI.
    expect(resolve("my%20pic.png")).toMatch(/^data:image\/png;base64,/);
    expect(resolve("my pic.png")).toMatch(/^data:image\/png;base64,/);
  });

  // v0.13.3 workflow-confirmed: frontmatter image + background attrs.
  test("collects frontmatter image: and slides-ng-image: values", () => {
    const md =
      "---\nimage: hero.png\n---\n# A\n\n---\nslides-ng-image: '[[deep/pic.jpg]]'\n---\n# B";
    const t = collectImageTargets(md).sort();
    expect(t).toContain("hero.png");
    expect(t).toContain("deep/pic.jpg"); // wikilink brackets stripped
  });
  test("collects data-background-image / data-background-video targets", () => {
    const md =
      '<!-- slide data-background-image="bg.jpg" -->\n# A\n\n<!-- slide data-background-video="clip.mp4" -->';
    const t = collectImageTargets(md).sort();
    expect(t).toContain("bg.jpg");
    expect(t).toContain("clip.mp4");
  });
  test("angle-bracket markdown dest with spaces captured whole", () => {
    expect(collectImageTargets("![a](<my pic.png>)")).toEqual(["my pic.png"]);
  });
  test("resolver strips wikilink brackets so frontmatter [[x]] matches", async () => {
    const app: AppLike = {
      vault: {
        async read() {
          return "---\nimage: '[[hero.png]]'\n---\n# A";
        },
        adapter: {
          async readBinary() {
            return new Uint8Array([9, 9, 9]).buffer;
          },
        },
        getAbstractFileByPath: () => null,
      },
      metadataCache: {
        getFirstLinkpathDest: (lp: string) =>
          lp === "hero.png" ? { path: "hero.png" } : null,
      },
    };
    const resolve = await buildImageDataUriResolver(app, { path: "deck.md" });
    // slideToHtml passes the raw frontmatter value (with brackets).
    expect(resolve("[[hero.png]]")).toMatch(/^data:image\/png;base64,/);
    expect(resolve("hero.png")).toMatch(/^data:image\/png;base64,/);
  });
});

describe("mimeForExtension", () => {
  test.each([
    ["a.png", "image/png"],
    ["a.jpg", "image/jpeg"],
    ["a.jpeg", "image/jpeg"],
    ["a.gif", "image/gif"],
    ["a.svg", "image/svg+xml"],
    ["a.webp", "image/webp"],
    ["a.avif", "image/avif"],
    ["a.bmp", "image/bmp"],
    ["a.ico", "image/x-icon"],
    ["a.unknown", "application/octet-stream"],
  ])("%s → %s", (path, mime) => {
    expect(mimeForExtension(path)).toBe(mime);
  });
  test("case-insensitive", () => {
    expect(mimeForExtension("PHOTO.PNG")).toBe("image/png");
  });
});

describe("arrayBufferToBase64", () => {
  test("round-trips small payloads", () => {
    const bytes = new Uint8Array([72, 105, 33]); // "Hi!"
    expect(arrayBufferToBase64(bytes.buffer)).toBe(btoa("Hi!"));
  });
  test("handles binary bytes including 0x00 and 0xFF", () => {
    const bytes = new Uint8Array([0, 255, 128, 1, 254]);
    const b64 = arrayBufferToBase64(bytes.buffer);
    // decode back and compare
    const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(Array.from(decoded)).toEqual([0, 255, 128, 1, 254]);
  });
  test("handles payloads larger than one chunk (>32KB)", () => {
    const big = new Uint8Array(70000);
    for (let i = 0; i < big.length; i++) big[i] = i % 256;
    const b64 = arrayBufferToBase64(big.buffer);
    const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(decoded.length).toBe(70000);
    expect(decoded[0]).toBe(0);
    expect(decoded[69999]).toBe(69999 % 256);
  });
});

describe("buildImageDataUriResolver", () => {
  function mockApp(files: Record<string, number[]>): AppLike {
    return {
      vault: {
        async read() {
          return "![[a.png]]\n![alt](folder/b.jpg)\n![x](https://e.com/z.png)";
        },
        adapter: {
          async readBinary(path: string) {
            const bytes = files[path];
            if (!bytes) throw new Error("not found: " + path);
            return new Uint8Array(bytes).buffer;
          },
        },
        getAbstractFileByPath(path: string) {
          return files[path] ? { path } : null;
        },
      },
      metadataCache: {
        getFirstLinkpathDest(linkpath: string) {
          // map "a.png" → "attach/a.png" to simulate Obsidian resolution
          if (linkpath === "a.png" && files["attach/a.png"]) {
            return { path: "attach/a.png" };
          }
          if (files[linkpath]) return { path: linkpath };
          return null;
        },
      },
    };
  }

  test("inlines resolvable images as data URIs", async () => {
    const app = mockApp({
      "attach/a.png": [137, 80, 78, 71], // PNG magic-ish
      "folder/b.jpg": [255, 216, 255],
    });
    const resolve = await buildImageDataUriResolver(app, { path: "deck.md" });
    expect(resolve("a.png")).toBe(
      `data:image/png;base64,${arrayBufferToBase64(new Uint8Array([137, 80, 78, 71]).buffer)}`
    );
    expect(resolve("folder/b.jpg")).toMatch(/^data:image\/jpeg;base64,/);
  });

  test("passthrough for remote URLs", async () => {
    const app = mockApp({});
    const resolve = await buildImageDataUriResolver(app, { path: "deck.md" });
    expect(resolve("https://e.com/z.png")).toBe("https://e.com/z.png");
  });

  test("returns null for unresolvable targets", async () => {
    const app = mockApp({});
    const resolve = await buildImageDataUriResolver(app, { path: "deck.md" });
    expect(resolve("missing.png")).toBeNull();
  });

  test("unreadable attachment is skipped, not fatal", async () => {
    // metadataCache resolves but readBinary throws → skip gracefully.
    const app: AppLike = {
      vault: {
        async read() {
          return "![[a.png]]";
        },
        adapter: {
          async readBinary() {
            throw new Error("EIO");
          },
        },
        getAbstractFileByPath() {
          return { path: "a.png" };
        },
      },
      metadataCache: {
        getFirstLinkpathDest() {
          return { path: "a.png" };
        },
      },
    };
    const resolve = await buildImageDataUriResolver(app, { path: "deck.md" });
    expect(resolve("a.png")).toBeNull();
  });
});
