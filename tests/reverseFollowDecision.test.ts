import { describe, expect, test } from "bun:test";
import {
  shouldReverseFollow,
  type ReverseFollowDecisionInput,
} from "../src/parser/reverseFollowDecision";

/** Base input: feature on, no active suppression, position moved. */
function base(
  overrides: Partial<ReverseFollowDecisionInput> = {}
): ReverseFollowDecisionInput {
  return {
    followPreviewInEditor: true,
    now: 10_000,
    suppressReverseFollowUntil: 0,
    previewH: 3,
    previewV: 0,
    syncedH: 1,
    syncedV: 0,
    ...overrides,
  };
}

describe("shouldReverseFollow", () => {
  test("fires on genuine preview navigation to a new slide", () => {
    expect(shouldReverseFollow(base())).toBe(true);
  });

  test("never fires when the feature is disabled", () => {
    expect(
      shouldReverseFollow(base({ followPreviewInEditor: false }))
    ).toBe(false);
  });

  test("suppressed within the post-reload window (the save-jump bug)", () => {
    // A fresh Reveal posts state(0) at now=10_000 while suppression runs
    // until 11_000. Following it would bounce the caret to the top.
    expect(
      shouldReverseFollow(
        base({
          now: 10_000,
          suppressReverseFollowUntil: 11_000,
          previewH: 0,
          previewV: 0,
        })
      )
    ).toBe(false);
  });

  test("resumes once the suppression window has elapsed", () => {
    expect(
      shouldReverseFollow(
        base({ now: 11_001, suppressReverseFollowUntil: 11_000 })
      )
    ).toBe(true);
  });

  test("boundary: now exactly at the suppression edge is no longer suppressed", () => {
    expect(
      shouldReverseFollow(
        base({ now: 11_000, suppressReverseFollowUntil: 11_000 })
      )
    ).toBe(true);
  });

  test("ignores the echo of our own forward-follow (same h + v)", () => {
    expect(
      shouldReverseFollow(base({ previewH: 2, previewV: 1, syncedH: 2, syncedV: 1 }))
    ).toBe(false);
  });

  test("fires when only the vertical sub-slide changed", () => {
    expect(
      shouldReverseFollow(base({ previewH: 2, previewV: 1, syncedH: 2, syncedV: 0 }))
    ).toBe(true);
  });

  test("fires when synced position is null (nothing synced yet)", () => {
    expect(
      shouldReverseFollow(base({ syncedH: null, previewH: 0, previewV: 0 }))
    ).toBe(true);
  });

  test("suppression beats a real position change", () => {
    // Even a true navigation is held off during the reload window; the
    // forward follow will re-establish the correct position.
    expect(
      shouldReverseFollow(
        base({
          now: 500,
          suppressReverseFollowUntil: 2_000,
          previewH: 7,
          syncedH: 1,
        })
      )
    ).toBe(false);
  });
});
