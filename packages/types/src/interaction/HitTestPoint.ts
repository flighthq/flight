import type { GraphNode } from '../scenegraph-core/GraphNode';

export type HitTestPoint = (source: GraphNode<symbol, object>, x: number, y: number, shapeFlag: boolean) => boolean;
