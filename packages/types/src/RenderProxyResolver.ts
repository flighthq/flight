import type { DisplayObject } from './DisplayObject';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState } from './RenderState';

export type RenderProxyResolver = {
  resolve: (state: RenderState, source: DisplayObject, node: RenderProxy2D) => boolean | null;
};
