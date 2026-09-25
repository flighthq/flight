import type { NodeAny } from './Node.ts';
import type { RenderProxy2D } from './RenderProxy2D.ts';
import type { RenderState } from './RenderState.ts';

export type RenderProxyAdapter = {
  adapt: (state: RenderState, source: NodeAny, node: RenderProxy2D) => boolean | null;
};
