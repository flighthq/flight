import type { GraphNode } from './GraphNode';

export type HitTestPoint = (source: GraphNode<symbol, object>, x: number, y: number, shapeFlag: boolean) => boolean;
