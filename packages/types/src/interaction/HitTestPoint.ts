import type { GraphNode } from '../scene-graph-core/GraphNode';

export type HitTestPoint = (source: GraphNode<symbol, object>, x: number, y: number, shapeFlag: boolean) => boolean;
