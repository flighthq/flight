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
