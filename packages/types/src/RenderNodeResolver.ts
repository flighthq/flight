import type { DisplayObject } from './DisplayObject';
import type { RenderState } from './RenderState';

export type RenderNodeResolver = {
  resolve: (state: RenderState, source: DisplayObject) => boolean | null;
};
