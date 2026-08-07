// A table whose stored checksum disagrees with the one computed from its bytes.
//
// Reported rather than enforced, deliberately. A mismatch is BAD DATA, not API misuse, and deciding
// that a font is unacceptable is the caller's judgement — a reader that refused a font which would
// otherwise load would have taken a policy decision away from the consumer and given them no way to
// opt out. So the reader keeps loading and hands back what it saw; a caller who cares can act on it,
// and a caller who does not never pays for the check.
export interface WoffChecksumMismatch {
  // What the file's own directory claims for this table.
  stored: number;
  // What the table's bytes actually sum to, by the format's own algorithm.
  computed: number;
  tag: string;
}
