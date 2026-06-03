import type { DisplayObject } from './DisplayObject';
import type { DisplayObjectRenderNode } from './DisplayObjectRenderNode';
import type { RenderState } from './RenderState';

export interface SceneNodeResolver {
  readonly updateChildren: boolean;
  resolve(
    state: RenderState,
    source: DisplayObject,
    next: () => DisplayObjectRenderNode,
  ): { node: DisplayObjectRenderNode; dirty?: boolean } | null;
}
