/**
 * Which of a column's independently-written values a provenance record describes.
 *
 * ★ THE FIELD NAME IS THE POINT. `fingerprint` and `sha256` are written by separate passes, so asking
 * for "the column's provenance" is a question with no answer — an accessor has to name which value it
 * means, or it returns one pass's record as though it spoke for both.
 */
export type CaptureBaselineProvenanceField = 'fingerprint' | 'sha256';
