/**
 * The outcome of a tolerance check (regression or parity): the measured `difference` between two
 * fingerprints, the `tolerance` it was compared against, and whether it `pass`ed (`difference <=
 * tolerance`). `difference` is `Number.POSITIVE_INFINITY` when a fingerprint could not be parsed (see
 * compareCaptureFingerprints), which fails any finite tolerance.
 */
export interface CaptureCheckResult {
  readonly pass: boolean;
  readonly difference: number;
  readonly tolerance: number;
}
