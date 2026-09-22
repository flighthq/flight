import type { NodeAny } from './Node';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState } from './RenderState';

export type RenderProxyAdapter = {
  adapt: (state: RenderState, source: NodeAny, node: RenderProxy2D) => boolean | null;
};
