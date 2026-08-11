// Write-side sanity predicates shared by every path that can bless capture evidence. Keeping these
// outside captureEntry/captureValidation lets the baseline store enforce them too: a new writer must not
// reproduce only the record shape while bypassing what the established writers refuse.

// Hex characters per fingerprint cell (one RGB triplet).
const CAPTURE_FINGERPRINT_CELL_CHARS = 6;

// Frames observed to be content-free. The encoded-PNG hash is retained while historical baselines use
// that derivation; additional derivations must add their corresponding bad-output hashes here rather than
// silently losing the refusal.
const REJECTED_CAPTURE_BASELINE_HASHES: ReadonlySet<string> = new Set([
  'a4f2105ecdefec94c5fe749c1dc5f2fb9dd74b9832cba0afcd3434f38c0380d0',
]);

/** True for an exact screenshot hash known to represent a content-free capture. */
export function isRejectedCaptureBaselineHash(hash: string): boolean {
  return REJECTED_CAPTURE_BASELINE_HASHES.has(hash);
}

/**
 * True when every cell of a coarse fingerprint carries the same value. A uniform frame may be a
 * legitimate render, but it cannot distinguish that render from a broken blank frame and must not become
 * regression ground truth.
 */
export function isUniformCaptureFingerprint(fingerprint: string): boolean {
  const payload = fingerprint.slice(fingerprint.indexOf(':') + 1);
  if (payload.length <= CAPTURE_FINGERPRINT_CELL_CHARS) return true;
  const first = payload.slice(0, CAPTURE_FINGERPRINT_CELL_CHARS);
  for (let i = CAPTURE_FINGERPRINT_CELL_CHARS; i < payload.length; i += CAPTURE_FINGERPRINT_CELL_CHARS) {
    if (payload.slice(i, i + CAPTURE_FINGERPRINT_CELL_CHARS) !== first) return false;
  }
  return true;
}
