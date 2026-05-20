import type { HasBoundsRect } from './HasBoundsRect';
import type { HasTransform2D } from './HasTransform2D';
import type { Matrix3x2 } from './Matrix3x2';
import type { Renderable } from './Renderable';
import type { RenderNode } from './RenderNode';

export interface RenderNode2D extends RenderNode {
  readonly source: Renderable & HasTransform2D & HasBoundsRect;
  transform2D: Matrix3x2;
}
