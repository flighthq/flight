import type { NodeAny } from './Node';
/**
 * Detail of a hit resolved by `describeGraphHit` on a node you already have. Carries the node, the
 * sub-index within it (text char / tile / quad; -1 when the kind has no exact provider), and the hit
 * point in the node's local coordinate space.
 */
export interface HitTestResult {
  localX: number;
  localY: number;
  node: NodeAny;
  subIndex: number;
}
