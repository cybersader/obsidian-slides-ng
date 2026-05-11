/**
 * Iframe-aware E2E helpers for slides-ng.
 *
 * The rendered deck lives inside an `<iframe srcdoc>` mounted by the
 * SlidesNGView. WDIO can't see elements inside an iframe until it has
 * `switchToFrame`d into it. These helpers centralize that dance so individual
 * specs stay readable.
 *
 * Usage:
 *
 *   import { switchToSlideFrame, switchToTop, waitForSlides } from "./helpers/iframe";
 *
 *   it("renders 5 slides", async () => {
 *     await switchToSlideFrame();
 *     try {
 *       await waitForSlides(5);
 *       const count = await $$("section.present, section:not(.stack)").length;
 *       expect(count).toBeGreaterThanOrEqual(5);
 *     } finally {
 *       await switchToTop();
 *     }
 *   });
 *
 * Always wrap your assertions in try/finally and call `switchToTop()` in the
 * finally — leaving the test runner inside an iframe context contaminates
 * the next test.
 */

declare const browser: WebdriverIO.Browser;
declare const $: (selector: string) => WebdriverIO.Element;

/** CSS selector for the iframe element the slides-ng view mounts. */
export const SLIDE_IFRAME_SELECTOR = "iframe.slides-ng-frame";

/**
 * Switch WDIO's element-query context into the slides-ng iframe.
 * Subsequent `$(...)` / `$$(...)` calls query the iframe's DOM.
 */
export async function switchToSlideFrame(): Promise<void> {
  const iframe = await $(SLIDE_IFRAME_SELECTOR);
  await iframe.waitForExist({ timeout: 5000, timeoutMsg: "slides-ng iframe never mounted" });
  await browser.switchFrame(iframe);
}

/** Switch back to the top-level Obsidian frame. Call from a `finally` block. */
export async function switchToTop(): Promise<void> {
  await browser.switchFrame(null);
}

/**
 * Wait for reveal.js to have laid out at least `n` slide sections inside the
 * current iframe context. Assumes you've already called `switchToSlideFrame()`.
 */
export async function waitForSlides(n: number, timeoutMs = 5000): Promise<void> {
  await browser.waitUntil(
    async () => {
      const count = await browser.execute(
        () => document.querySelectorAll(".reveal section").length
      );
      return count >= n;
    },
    {
      timeout: timeoutMs,
      timeoutMsg: `expected at least ${n} reveal.js sections inside the iframe`,
    }
  );
}

/**
 * Read the text content of whatever slide reveal.js currently has marked
 * `.present`. Assumes iframe-frame context.
 */
export async function getCurrentSlideText(): Promise<string> {
  return await browser.execute(() => {
    const current = document.querySelector(".reveal section.present") as HTMLElement | null;
    return current?.innerText?.trim() ?? "";
  });
}

/**
 * Count visible `.fragment.visible` elements in the current slide. Used for
 * verifying `<v-click>` reveals advance correctly.
 */
export async function countVisibleFragments(): Promise<number> {
  return await browser.execute(
    () => document.querySelectorAll(".reveal section.present .fragment.visible").length
  );
}
