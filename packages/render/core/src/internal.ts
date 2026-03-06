import type { Renderable, RenderState, RenderNode } from '@flighthq/types';

export type RenderStateInternal = Omit<
  RenderState,
  | 'backgroundColor'
  | 'backgroundColorRGBA'
  | 'backgroundColorString'
  | 'currentFrameID'
  | 'currentQueue'
  | 'currentQueueLength'
  | 'renderNodeMap'
  | 'rendererMapID'
  | 'tempStack'
> & {
  backgroundColor: number;
  backgroundColorRGBA: number[];
  backgroundColorString: string;
  currentFrameID: number;
  currentQueue: RenderNode[];
  currentQueueLength: number;
  renderNodeMap: WeakMap<Renderable, RenderNode>;
  rendererMapID: number;
  tempStack: Renderable[];
};
