import type { HasBoundsRect } from './HasBoundsRect';
import type { HasTransform2D } from './HasTransform2D';
import type { Matrix } from './Matrix';
import type { Renderable } from './Renderable';
import type { RenderNode } from './RenderNode';

export interface RenderNode2D extends RenderNode {
  presentationTransform2D: Matrix | null;
  readonly source: Renderable & HasTransform2D & HasBoundsRect;
  transform2D: Matrix;
}
