import type { NodeAny } from './Node';
/**
 * Detailed result from `findGraphHitTargetDetailed`. Carries the hit node plus the
 * sub-index within that node (tile index for Tilemap, quad index for QuadBatch) and
 * the hit point in the node's local coordinate space. `subIndex` is -1 when the
 * node kind has no meaningful sub-index.
 */
export interface HitTestResult {
  localX: number;
  localY: number;
  node: NodeAny;
  subIndex: number;
}

/**
 * Sub-index resolver registered per node kind via `registerHitTestDetailed`. Given a node hit at
 * world-space (x, y), returns the index of the sub-element under the point (tile index, quad index,
 * glyph index), or -1 when the point falls on no sub-element. Runs only on the Tier-2 detailed path.
 */
export type HitTestDetailedFunction = (source: NodeAny, x: number, y: number, shapeFlag: boolean) => number;
