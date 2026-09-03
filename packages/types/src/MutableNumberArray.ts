// A numeric sequence a function may WRITE THROUGH, spanning the plain array and the typed arrays
// geometry buffers use.
//
// `ArrayLike<number>` cannot express this: its index signature is read-only, so a function that writes
// through its parameter had to intersect it with a writable one at every such site. That intersection
// is anonymous, repeated, and — because it is an intersection rather than a union — accepts any
// ArrayLike at all, including ones nothing can write to. A concrete union names the buffers that
// actually work.
export type MutableNumberArray = Float32Array | Float64Array | number[];
