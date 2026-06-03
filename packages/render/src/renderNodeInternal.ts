import type { Renderable, RenderNode, RenderState } from '@flighthq/types';

import type { DisplayObjectRenderNodeResolver } from './renderNodeResolver';

export type RenderNodeStateInternal = Omit<
  RenderState,
  'currentFrameID' | 'currentQueue' | 'currentQueueLength' | 'renderNodeMap' | 'rendererMapID' | 'tempStack'
> & {
  currentFrameID: number;
  currentQueue: RenderNode[];
  currentQueueLength: number;
  displayObjectRenderNodeResolvers: DisplayObjectRenderNodeResolver[];
  renderNodeMap: WeakMap<Renderable, RenderNode>;
  rendererMapID: number;
  tempStack: Renderable[];
};
