import type { Path } from './Path';

// The style indices in force across one style-change record. A morph's end edge set repeats the start's
// record structure but leaves the style fields unset — the two shapes share one style array, so the end
// shape's Nth style change means whatever the start shape's Nth style change meant. Replaying these is
// what gives the end contours a style index at all.
export interface SwfShapeStyleRun {
  readonly fill0: number;
  readonly fill1: number;
  readonly line: number;
}

// One decoded SHAPE's contours, keyed by the one-based style index its edges referenced. A morph shape
// stores its geometry twice against a single style array, so both endpoints decode into this and are
// paired by index — an index present in only one endpoint has no morph and is dropped.
export interface SwfShapeStylePaths {
  readonly fills: ReadonlyMap<number, Path>;
  readonly lines: ReadonlyMap<number, Path>;
  // The style runs this decode observed, in record order, for an end edge set to replay.
  readonly runs: readonly SwfShapeStyleRun[];
}
