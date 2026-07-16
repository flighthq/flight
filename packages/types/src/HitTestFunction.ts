import type { NodeAny } from './Node';

/**
 * Coarse (bounding) hit function registered per node kind via `registerHitTest`. Returns whether the
 * node's bbox contains world-space (x, y). The cheap path used by the non-`Precise` graph queries.
 */
export type HitTestFunction = (source: NodeAny, x: number, y: number) => boolean;

/**
 * Exact (precise) hit provider registered per node kind via `registerHitTestPrecise`. Given world-space
 * (x, y), returns -1 (precise miss), 0 (hit, no sub-element), or a sub-element index (>0: text char,
 * tile, quad). Consulted by the `*Precise` graph queries and by `describeGraphHit`; opt-in per kind so
 * the exact geometry and its dependencies tree-shake unless registered.
 */
export type HitTestPreciseFunction = (source: NodeAny, x: number, y: number) => number;
