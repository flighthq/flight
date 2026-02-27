import type { Renderable, RenderableData, RendererState } from '@flighthq/types';

export type RendererStateInternal = Omit<
  RendererState,
  | 'backgroundColor'
  | 'backgroundColorRGBA'
  | 'backgroundColorString'
  | 'currentFrameID'
  | 'currentQueue'
  | 'currentQueueLength'
  | 'renderableDataMap'
  | 'tempStack'
> & {
  backgroundColor: number;
  backgroundColorRGBA: number[];
  backgroundColorString: string;
  currentFrameID: number;
  currentQueue: RenderableData[];
  currentQueueLength: number;
  renderableDataMap: WeakMap<Renderable, RenderableData>;
  tempStack: Renderable[];
};
