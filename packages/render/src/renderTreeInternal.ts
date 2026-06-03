import type { Renderable, RenderState, RenderTreeNode } from '@flighthq/types';

import type { DisplayObjectRenderNodeResolver } from './renderNodeResolver';

export type RenderTreeStateInternal = Omit<
  RenderState,
  'currentFrameID' | 'currentQueue' | 'currentQueueLength' | 'renderNodeMap' | 'rendererMapID' | 'tempStack'
> & {
  currentFrameID: number;
  currentQueue: RenderTreeNode[];
  currentQueueLength: number;
  displayObjectRenderNodeResolvers: DisplayObjectRenderNodeResolver[];
  renderNodeMap: WeakMap<Renderable, RenderTreeNode>;
  rendererMapID: number;
  tempStack: Renderable[];
};
