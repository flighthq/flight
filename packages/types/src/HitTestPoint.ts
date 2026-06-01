import type { GraphNode } from './GraphNode';

export type GraphHitTestFn = (source: GraphNode<symbol, object>, x: number, y: number, shapeFlag: boolean) => boolean;
