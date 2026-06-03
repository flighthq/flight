import type { Renderable, RenderNode, RenderState } from '@flighthq/types';

export type RenderNodeStateInternal = Omit<
  RenderState,
  'currentFrameID' | 'currentQueue' | 'currentQueueLength' | 'renderNodeMap' | 'rendererMapID' | 'tempStack'
> & {
  currentFrameID: number;
  currentQueue: RenderNode[];
  currentQueueLength: number;
  renderNodeMap: WeakMap<Renderable, RenderNode>;
  rendererMapID: number;
  tempStack: Renderable[];
};
