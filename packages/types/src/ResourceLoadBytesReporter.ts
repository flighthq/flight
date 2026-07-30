// How a load factory reports its own progress in bytes.
//
// Passed to `ResourceLoadItem.load` as a second argument, which is why the seam is additive: a factory
// written against the one-argument form keeps working untouched and simply never reports. Only a
// factory that can actually observe its transfer — a fetch reading a stream, an XHR with a progress
// event — has anything to say, and the loader cannot know the byte count on its behalf.
//
// `total` is optional: a source that knows only how much has arrived so far omits it, and the item's
// `bytesHint` stands in. Calls after the load settles are ignored rather than trusted, because the
// loader recycles its per-item records and a late report would otherwise write into another item's.
export type ResourceLoadBytesReporter = (loaded: number, total?: number) => void;
