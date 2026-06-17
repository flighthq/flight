import type { Renderable } from './Renderable';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState } from './RenderState';

export type RenderProxyAdapter = {
  adapt: (state: RenderState, source: Renderable, node: RenderProxy2D) => boolean | null;
};
