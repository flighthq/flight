import type { Renderable, RenderProxy, RenderState } from '@flighthq/types';

export type RenderProxyStateInternal = Omit<
  RenderState,
  'currentFrameID' | 'renderProxyMap' | 'rendererMapID' | 'tempStack'
> & {
  currentFrameID: number;
  renderProxyMap: WeakMap<Renderable, RenderProxy>;
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
