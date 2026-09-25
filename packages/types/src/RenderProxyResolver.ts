import type { Node2D } from './Node2D.ts';
import type { RenderProxy2D } from './RenderProxy2D.ts';
import type { RenderState } from './RenderState.ts';

export type RenderProxyResolver = {
  resolve: (state: RenderState, source: Node2D, node: RenderProxy2D) => boolean | null;
};
