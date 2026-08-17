/**
 * What produced one column's committed baseline values — the conditions the artifact was captured
 * under, recorded alongside it.
 *
 * ★ THE RECORD DID NOT USED TO CARRY THIS, AND THAT IS ONE DEFECT WEARING THREE FACES. A baseline's
 * `fingerprint` and `sha256` are written by separate passes, so they could come from different commits;
 * the acquisition branch that produced the screenshot was never written down; and neither was the frame
 * index the scene was frozen at. Each was chased separately and each is the same missing sentence — the
 * record says what was measured and not what it was measured under. Two records that disagree are then
 * indistinguishable from two records taken under different conditions, and only `git blame` can tell
 * them apart after the fact.
 *
 * Recording is deliberately staged ahead of enforcing. A column written before this field existed simply
 * omits it and reads as unknown provenance, which is honest and costs no re-baseline; refusing to
 * COMPARE across differing provenance is held until most records carry it, because a comparison gate
 * that fires on every legacy record is a gate nobody can leave switched on.
 */
export interface CaptureBaselineProvenance {
  /** `captureFrames` the artifact was produced at — the deterministic freeze point, 0 when unset. */
  frames: number;
  /**
   * SHA-256 of the scene source bytes when THESE values were captured, or `null` when the subject has
   * no resolvable scene source.
   *
   * Each independently-written value owns this source hash inside its provenance record. A fingerprint
   * captured at one commit and a screenshot hash captured at another therefore expose two sources rather
   * than a single column-level value that silently appears to describe both.
   */
  sourceHash: string | null;
  /**
   * The in-page verification target kind (`'webgl'`, `'webgpu'`, `'canvas'`, `'dom'`), or `null` when
   * the page registered none. Selects the in-browser freeze timing: a target that is not literally
   * `'webgl'` or `'webgpu'` takes the early-return arm.
   */
  targetKind: string | null;
  /**
   * Whether the page published a render image. This is what selects the ACQUISITION BRANCH — a
   * published image is read from the page, an unpublished one falls through to a browser screenshot —
   * so two records that disagree here were not produced by the same encoder.
   */
  verifyPublished: boolean;
  /** Extra animation frames the in-page warmup rendered past `frames`. 0 when the page drew immediately. */
  warmupFrames: number;
}
