import type { Node } from './Node';

export type GraphHitTestFunction = (source: Node<symbol, object>, x: number, y: number, shapeFlag: boolean) => boolean;
