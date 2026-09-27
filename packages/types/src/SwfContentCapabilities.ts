/**
 * Content-level capability signals extracted from a SWF's tag stream.
 *
 * This is a deeper census than `collectSwfTagCounts`: instead of only counting tag codes, it peeks into
 * specific tag bodies to discover what backend capabilities the content actually exercises. The cost is
 * marginal — the tag stream is already decompressed and in memory, and each signal reads one or two bytes
 * at a fixed offset inside the tag body.
 *
 * These signals drive the requirement analyzer: a SWF that never sets a blend mode does not pull in blend
 * mode application, and a SWF with only solid-color shapes does not pull in texture fill rendering.
 *
 * Contract lane only: build-time analysis input, not something a running app calls.
 */
export interface SwfContentCapabilities {
  readonly tagCounts: ReadonlyMap<number, number>;
  readonly usesBlendMode: boolean;
  readonly usesFilters: boolean;
  readonly usesBitmapFills: boolean;
}
