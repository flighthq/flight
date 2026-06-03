import type { Matrix } from './Matrix';
import type { RenderNode } from './RenderNode';

export interface RenderNode2D extends RenderNode {
  presentationTransform2D: Matrix | null;
}
