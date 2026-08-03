import type { Path } from './Path';

// One morph shape's decoded geometry, keyed by the one-based style index its edges referenced. Both
// endpoints of a style come out together and with identical structure, because they were walked in step
// rather than decoded apart and matched afterwards.
export interface SwfMorphShapePaths {
  readonly fills: ReadonlyMap<number, { readonly end: Path; readonly start: Path }>;
  readonly lines: ReadonlyMap<number, { readonly end: Path; readonly start: Path }>;
}
