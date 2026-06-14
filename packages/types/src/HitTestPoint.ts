import type { Node } from './Node';

export type GraphHitTestFn = (source: Node<symbol, object>, x: number, y: number, shapeFlag: boolean) => boolean;
