// What a load knows about its own byte volume. The shape is deliberately not `loaded`/`total`: byte
// totals are not knowable up front, because `bytesHint` is optional per item and a factory may report
// only how much has arrived. Presenting partial knowledge as a denominator produces a bar that
// rescales downward as more headers arrive, which reads as progress going backwards.
//
// So the known part is labeled as known, and the caller decides whether it is enough to divide by.
// `getResourceLoadProgress` remains the honest 0..1 figure; these are for display detail.
export interface ResourceLoadBytes {
  // Bytes transferred so far across the whole load. Summed from what each item has reported, so it is
  // always valid and only ever grows — usable on its own as a "12.4 MB downloaded" readout.
  bytesLoaded: number;
  // The total for the items whose size is known, from `bytesHint` or a factory that reported one.
  // Grows as more items declare a size, so it is a floor on the eventual total, never the total.
  bytesTotalKnown: number;
  // How many items contributed to `bytesTotalKnown`. Compare against `ResourceLoadCounts.totalItems`
  // to judge whether the known total covers enough of the batch to divide by.
  itemsWithKnownBytes: number;
}
