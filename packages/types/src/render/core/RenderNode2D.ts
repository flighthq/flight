import type { Matrix3x2 } from '../../geometry';
import type { HasBoundsRect, HasTransform2D } from '../../scene/graph/core';
import type { Renderable } from './Renderable';
import type { RenderNode } from './RenderNode';

export interface RenderNode2D extends RenderNode {
  readonly source: Renderable & HasTransform2D & HasBoundsRect;
  transform2D: Matrix3x2;
}
