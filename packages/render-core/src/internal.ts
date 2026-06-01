import type { Renderable, RenderNode, RenderState } from '@flighthq/types';

import type { DisplayObjectKindTransformer } from './renderer';

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
  displayObjectKindTransformers: DisplayObjectKindTransformer[];
  renderNodeMap: WeakMap<Renderable, RenderNode>;
  rendererMapID: number;
  tempStack: Renderable[];
};
