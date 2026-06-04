import type { Renderable, RenderNode, RenderState } from '@flighthq/types';

export type RenderNodeStateInternal = Omit<
  RenderState,
  'currentFrameID' | 'renderNodeMap' | 'rendererMapID' | 'tempStack'
> & {
  currentFrameID: number;
  renderNodeMap: WeakMap<Renderable, RenderNode>;
  rendererMapID: number;
  tempStack: Renderable[];
};

export type RenderStateInternal = Omit<
  RenderState,
  | 'backgroundColor'
  | 'backgroundColorRGBA'
  | 'backgroundColorString'
  | 'displayObjectMaskRendererMapID'
  | 'rendererMapID'
> & {
  backgroundColor: number;
  backgroundColorRGBA: number[];
  backgroundColorString: string;
  displayObjectMaskRendererMapID: number;
  rendererMapID: number;
};
