import type { Kind } from './Entity.ts';

// A dense array indexed by a token the wire format already carries as a small integer. `vocabulary` maps
// ordinal to `Kind` so a miss can be named; the hot path never consults it, because the decoder already
// holds the integer.
export interface OrdinalTable<T> {
  readonly entries: readonly (T | null)[];
  readonly vocabulary: readonly Kind[];
}
