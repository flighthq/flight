/**
 * What `wrapMeshGeometryUvs` would do to a geometry's primitives, as plain data — the shakeable
 * `explain*` query paired with an operation that reports no failure of its own.
 *
 * Wrapping folds each coordinate into [0, 1) independently, per vertex. That is faithful only while a
 * primitive's corners all sit in the SAME unit tile: then the fold is one uniform integer shift and,
 * under a repeating sampler, nothing about the sampling changes. A primitive whose corners straddle a
 * tile boundary is a different case — 0.95 beside 1.02 becomes 0.95 beside 0.02, and the primitive now
 * interpolates backwards across the whole texture instead of forwards through the boundary. It tears,
 * and nothing throws, because per-vertex arithmetic cannot see the primitive its vertices belong to.
 *
 * The straddle is the whole predicate, and it is deliberately not "some coordinate lies outside [0, 1)":
 * a mesh whose UVs arrived in 1..2 and wants them in 0..1 is exactly what the operation exists for, and
 * every one of its primitives shares a tile. Reporting that as a tear would fire the guard on its own
 * use case.
 *
 * `tearsU` and `tearsV` separate the axes because the axis names the cause: a longitude seam tears in u
 * only, a pole-wrapped map in v only.
 */
export interface MeshGeometryUvWrap {
  /** Index of the first torn primitive, in primitive order, for a caller that wants to go and look. -1 when none tears. */
  firstTornPrimitive: number;
  /** Primitives examined. 0 when the layout carries no uv0 channel, so nothing would be wrapped at all. */
  primitiveCount: number;
  /** Whether any primitive's corners span more than one tile horizontally. */
  tearsU: boolean;
  /** Whether any primitive's corners span more than one tile vertically. */
  tearsV: boolean;
  /** How many primitives would tear. Zero means the fold is a uniform shift everywhere and changes no sampling. */
  tornPrimitiveCount: number;
}
