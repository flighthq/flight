import type { NodeAny } from './Node';
import type { Rectangle } from './Rectangle';
/**
 * A hit area proxy: either a rectangular region or another node whose hit test is
 * used in place of the source node's own geometry. When set on a node via
 * `setNodeHitArea`, the node's hit test delegates entirely to this region.
 */
export type HitArea = Readonly<Rectangle> | Readonly<NodeAny>;
