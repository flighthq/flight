/**
 * One COLLADA element decoder, described rather than invoked.
 *
 * ★ NO `decode` MEMBER, DELIBERATELY. The six COLLADA decoders do not share a signature:
 * `appendColladaMaterials` takes six parameters and appends into caller-owned arrays,
 * `decodeColladaControllers` takes XML text and returns skins, the camera and light decoders are
 * module-private, and geometry has no function of its own — it is read inline by `parseCollada`'s walk.
 * Giving them a common operation would mean rewriting every call site and the state threaded through
 * them, which is a change to parse semantics. Declaring the member and leaving it unimplemented would be
 * worse than omitting it: a family whose central operation is a lie reads as a working seam.
 *
 * So this records what is true now — the feature, the elements claimed, and whether the decoder is
 * reachable from outside its package. `entryPoint: null` states that a decoder is internal; it is not an
 * omission, and it marks exactly what a future registrable seam would have to extract first.
 */
export interface ColladaElementDecoderDescriptor {
  /** The COLLADA elements this decoder reads, by local name. */
  readonly elements: readonly string[];
  /** The exported function a caller can reach, or `null` when the decoder is internal to `parseCollada`. */
  readonly entryPoint: string | null;
  /** The feature this decoder provides. */
  readonly feature: string;
}
