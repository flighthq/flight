import type { RenderState } from '@flighthq/types';

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
