import type { Node2D } from './Node2D';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState } from './RenderState';

export type RenderProxyResolver = {
  resolve: (state: RenderState, source: Node2D, node: RenderProxy2D) => boolean | null;
};
