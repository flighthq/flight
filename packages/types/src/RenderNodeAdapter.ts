import type { Renderable } from './Renderable';
import type { RenderNode2D } from './RenderNode2D';
import type { RenderState } from './RenderState';

export type RenderNodeAdapter = {
  adapt: (state: RenderState, source: Renderable, node: RenderNode2D) => boolean | null;
};
