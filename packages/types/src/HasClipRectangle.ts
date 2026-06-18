import type { Entity } from './Entity';
import type { Node, NodeTraits } from './Node';
import type { Rectangle } from './Rectangle';

export interface HasClipRectangle extends Entity {
  /**
   * Rectangular scissor clip applied to this node and its subtree, in the node's local space. Null
   * means no clip. Backends realize it with a native clip (Canvas), scissor rect (WebGL/WebGPU), or
   * CSS clip-path (DOM); nested clips intersect.
   */
  clipRectangle: Rectangle | null;
}

export type ClipRectangleNode<Traits extends object = NodeTraits> = Node<Traits> & HasClipRectangle;
