/**
 * Pure decision for the reverse (preview → editor) cursor follow.
 *
 * Extracted from `SlidesNGView`'s `slides-ng-state` handler so the
 * gating logic is unit-testable without an Obsidian app or a live
 * iframe. The follow system has regressed several times; this keeps
 * the three guards honest:
 *
 *   1. the feature must be enabled,
 *   2. the iframe must NOT have just reloaded (a fresh Reveal boots at
 *      slide 0 and posts a transient state before the forward follow
 *      restores it — following that bounces the caret to the top on
 *      every save), and
 *   3. the reported position must actually differ from the last synced
 *      position (otherwise it's the echo of our own forward follow).
 */
export interface ReverseFollowDecisionInput {
  followPreviewInEditor: boolean;
  /** `Date.now()` at the moment the state message arrives. */
  now: number;
  /** Timestamp until which reverse-follow is suppressed post-reload. */
  suppressReverseFollowUntil: number;
  /** Slide index the preview now reports. */
  previewH: number;
  /** Vertical sub-slide index the preview now reports. */
  previewV: number;
  /** Last (h) position we synced to the preview, or null if none. */
  syncedH: number | null;
  /** Last (v) position we synced to the preview. */
  syncedV: number;
}

export function shouldReverseFollow(input: ReverseFollowDecisionInput): boolean {
  if (!input.followPreviewInEditor) return false;
  // Within the post-reload suppression window → treat as re-init noise.
  if (input.now < input.suppressReverseFollowUntil) return false;
  // Same position we last synced → this is our own forward-follow echo.
  return input.previewH !== input.syncedH || input.previewV !== input.syncedV;
}
