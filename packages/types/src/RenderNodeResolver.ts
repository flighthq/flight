import type { DisplayObject } from './DisplayObject';
import type { DisplayObjectRenderNode } from './DisplayObjectRenderNode';
import type { RenderState } from './RenderState';

export type RenderNodeResolver = {
  resolve: (state: RenderState, source: DisplayObject, node: DisplayObjectRenderNode) => boolean | null;
};
