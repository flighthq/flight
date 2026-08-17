/**
 * The string-valued fields of a CaptureColumnBaseline — the ones a get/set-by-name accessor can carry.
 * Deliberately an explicit union rather than `keyof CaptureColumnBaseline`: the column also holds
 * `provenance`, which is a record rather than a string, and a `keyof` would silently admit it and make
 * every accessor's return type a lie.
 */
export type CaptureBaselineField = 'fingerprint' | 'sha256';
