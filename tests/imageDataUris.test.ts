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
  test("excludes remote + data URLs (file:// is now inlined when local)", () => {
    const md = "![x](https://e.com/x.png)\n![[data:foo]]\n![y](file:///z.png)";
    const t = collectImageTargets(md);
    expect(t).not.toContain("https://e.com/x.png");
    // `file://` is no longer passthrough — it's collected so a vault-local
    // file:// path can be resolved + inlined (external ones just miss).
    expect(t).toContain("file:///z.png");
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

  // Raw HTML <img> tags — the durable "just write HTML" authoring path.
  test("collects raw <img src> (double, single, unquoted)", () => {
    const md = [
      '<img src="_attachments/a.png">',
      "<img alt='x' src='b.jpg' style='height:40px'>",
      "<img src=c.gif width=10>",
    ].join("\n");
    const t = collectImageTargets(md).sort();
    expect(t).toEqual(["_attachments/a.png", "b.jpg", "c.gif"]);
  });
  test("raw <img> with '>' in a pre-src attribute is still collected", () => {
    expect(collectImageTargets('<img title="Q3 > Q2" src="chart.png">')).toEqual([
      "chart.png",
    ]);
  });
  test("raw <img> collects the real src, not a data-src", () => {
    const t = collectImageTargets('<img data-src="thumb.png" src="hero.png">');
    expect(t).toContain("hero.png");
    expect(t).not.toContain("thumb.png");
  });
  test("raw <img> skips http/data but keeps file:// and app://local", () => {
    const md = [
      '<img src="https://e.com/x.png">',
      '<img src="data:image/png;base64,AAAA">',
      '<img src="file:///Y:/vault/a.png">',
      '<img src="app://local/Y:/vault/b.png">',
    ].join("\n");
    const t = collectImageTargets(md);
    expect(t).not.toContain("https://e.com/x.png");
    expect(t.some((x) => x.startsWith("data:"))).toBe(false);
    expect(t).toContain("file:///Y:/vault/a.png");
    expect(t).toContain("app://local/Y:/vault/b.png");
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

  test("cache by path|mtime avoids re-reading unchanged files", async () => {
    let reads = 0;
    const app: AppLike = {
      vault: {
        async read() {
          return "![[a.png]]";
        },
        adapter: {
          async readBinary() {
            reads++;
            return new Uint8Array([1, 2, 3]).buffer;
          },
        },
        getAbstractFileByPath() {
          return null;
        },
      },
      metadataCache: {
        getFirstLinkpathDest() {
          return { path: "a.png", stat: { mtime: 100 } };
        },
      },
    };
    const cache = new Map<string, string>();
    await buildImageDataUriResolver(app, { path: "deck.md" }, cache);
    await buildImageDataUriResolver(app, { path: "deck.md" }, cache);
    expect(reads).toBe(1); // second refresh hit the cache
    expect(cache.has("a.png|100")).toBe(true);
  });

  test("cache miss when mtime changes (file edited)", async () => {
    let reads = 0;
    let mtime = 100;
    const app: AppLike = {
      vault: {
        async read() {
          return "![[a.png]]";
        },
        adapter: {
          async readBinary() {
            reads++;
            return new Uint8Array([1]).buffer;
          },
        },
        getAbstractFileByPath: () => null,
      },
      metadataCache: {
        getFirstLinkpathDest: () => ({ path: "a.png", stat: { mtime } }),
      },
    };
    const cache = new Map<string, string>();
    await buildImageDataUriResolver(app, { path: "deck.md" }, cache);
    mtime = 200; // the image was replaced
    await buildImageDataUriResolver(app, { path: "deck.md" }, cache);
    expect(reads).toBe(2);
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

describe("buildImageDataUriResolver — raw <img> src path forms", () => {
  test("relative + ./ prefix resolve against the deck folder", async () => {
    const app: AppLike = {
      vault: {
        async read() {
          return '<img src="_attachments/logo.png">\n<img src="./_attachments/logo.png">';
        },
        adapter: {
          async readBinary(p: string) {
            if (p === "talks/_attachments/logo.png") {
              return new Uint8Array([1, 2, 3]).buffer;
            }
            throw new Error("not found: " + p);
          },
        },
        getAbstractFileByPath(p: string) {
          return p === "talks/_attachments/logo.png" ? { path: p } : null;
        },
      },
      metadataCache: { getFirstLinkpathDest: () => null },
    };
    const resolve = await buildImageDataUriResolver(app, { path: "talks/q2.md" });
    expect(resolve("_attachments/logo.png")).toMatch(/^data:image\/png;base64,/);
    expect(resolve("./_attachments/logo.png")).toMatch(/^data:image\/png;base64,/);
  });

  test("absolute file:// and app://local resolve via the vault base path", async () => {
    const app: AppLike = {
      vault: {
        async read() {
          return [
            '<img src="file:///Y:/vault/2%20-%20Areas/_attachments/bw.png">',
            '<img src="app://local/Y:/vault/2%20-%20Areas/_attachments/bw.png">',
          ].join("\n");
        },
        adapter: {
          async readBinary(p: string) {
            if (p === "2 - Areas/_attachments/bw.png") {
              return new Uint8Array([9, 9]).buffer;
            }
            throw new Error("not found: " + p);
          },
          getBasePath() {
            return "Y:/vault";
          },
        },
        getAbstractFileByPath(p: string) {
          return p === "2 - Areas/_attachments/bw.png" ? { path: p } : null;
        },
      },
      metadataCache: { getFirstLinkpathDest: () => null },
    };
    const resolve = await buildImageDataUriResolver(app, {
      path: "2 - Areas/deck.md",
    });
    expect(
      resolve("file:///Y:/vault/2%20-%20Areas/_attachments/bw.png")
    ).toMatch(/^data:image\/png;base64,/);
    expect(
      resolve("app://local/Y:/vault/2%20-%20Areas/_attachments/bw.png")
    ).toMatch(/^data:image\/png;base64,/);
  });

  test("POSIX absolute file:// and app://local resolve (leading-slash base path)", async () => {
    // macOS/Linux: getBasePath() returns a POSIX absolute path with a
    // leading slash, but stripScheme drops the leading slash of the ref.
    const app: AppLike = {
      vault: {
        async read() {
          return [
            '<img src="file:///Users/foo/MyVault/2%20-%20Areas/_attachments/bw.png">',
            '<img src="app://local/Users/foo/MyVault/2%20-%20Areas/_attachments/bw.png">',
          ].join("\n");
        },
        adapter: {
          async readBinary(p: string) {
            if (p === "2 - Areas/_attachments/bw.png") {
              return new Uint8Array([7]).buffer;
            }
            throw new Error("not found: " + p);
          },
          getBasePath() {
            return "/Users/foo/MyVault";
          },
        },
        getAbstractFileByPath(p: string) {
          return p === "2 - Areas/_attachments/bw.png" ? { path: p } : null;
        },
      },
      metadataCache: { getFirstLinkpathDest: () => null },
    };
    const resolve = await buildImageDataUriResolver(app, {
      path: "2 - Areas/deck.md",
    });
    expect(
      resolve("file:///Users/foo/MyVault/2%20-%20Areas/_attachments/bw.png")
    ).toMatch(/^data:image\/png;base64,/);
    expect(
      resolve("app://local/Users/foo/MyVault/2%20-%20Areas/_attachments/bw.png")
    ).toMatch(/^data:image\/png;base64,/);
  });

  test("absolute path outside the vault base is not resolved", async () => {
    const app: AppLike = {
      vault: {
        async read() {
          return '<img src="file:///Z:/elsewhere/x.png">';
        },
        adapter: {
          async readBinary() {
            return new Uint8Array([1]).buffer;
          },
          getBasePath() {
            return "Y:/vault";
          },
        },
        getAbstractFileByPath: () => null,
      },
      metadataCache: { getFirstLinkpathDest: () => null },
    };
    const resolve = await buildImageDataUriResolver(app, { path: "deck.md" });
    expect(resolve("file:///Z:/elsewhere/x.png")).toBeNull();
  });
});
