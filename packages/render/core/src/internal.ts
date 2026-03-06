import type { Renderable, RendererState, RenderNode } from '@flighthq/types';

export type RendererStateInternal = Omit<
  RendererState,
  | 'backgroundColor'
  | 'backgroundColorRGBA'
  | 'backgroundColorString'
  | 'currentFrameID'
  | 'currentQueue'
  | 'currentQueueLength'
  | 'renderNodeMap'
  | 'tempStack'
> & {
  backgroundColor: number;
  backgroundColorRGBA: number[];
  backgroundColorString: string;
  currentFrameID: number;
  currentQueue: RenderNode[];
  currentQueueLength: number;
  renderNodeMap: WeakMap<Renderable, RenderNode>;
  tempStack: Renderable[];
};
