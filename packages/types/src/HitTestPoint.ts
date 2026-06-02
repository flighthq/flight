import type { SceneNode } from './SceneNode';

export type GraphHitTestFn = (source: SceneNode<symbol, object>, x: number, y: number, shapeFlag: boolean) => boolean;
