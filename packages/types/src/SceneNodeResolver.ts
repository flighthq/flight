import type { DisplayObject } from './DisplayObject';
import type { DisplayObjectRenderTreeNode } from './DisplayObjectRenderTreeNode';
import type { RenderState } from './RenderState';

export interface SceneNodeResolver {
  readonly updateChildren: boolean;
  resolve(
    state: RenderState,
    source: DisplayObject,
    next: () => DisplayObjectRenderTreeNode,
  ): { node: DisplayObjectRenderTreeNode; dirty?: boolean } | null;
}
