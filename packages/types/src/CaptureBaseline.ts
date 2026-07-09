import type { CaptureColumnBaseline } from './CaptureColumnBaseline';

/**
 * A single capture test's committed baseline: a map from column name (backend/renderer id, e.g.
 * `canvas` or `flight:webgl`) to that column's baseline values. This is the in-memory shape of one
 * baseline JSON file; formatCaptureBaseline / parseCaptureBaseline serialize it with sorted keys so a
 * re-baseline of one column produces a minimal diff.
 */
export type CaptureBaseline = Record<string, CaptureColumnBaseline>;
