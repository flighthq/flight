import type { NodeAny } from './Node';

export type HitTestFunction = (source: NodeAny, x: number, y: number, shapeFlag: boolean) => boolean;
