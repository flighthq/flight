import type { DisplayObject } from './DisplayObject';
import type { RenderNode2D } from './RenderNode2D';
import type { RenderState } from './RenderState';

export type RenderNodeResolver = {
  resolve: (state: RenderState, source: DisplayObject, node: RenderNode2D) => boolean | null;
};
