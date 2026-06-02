import type { RenderState } from '@flighthq/types';

export type RenderStateInternal = Omit<
  RenderState,
  'backgroundColor' | 'backgroundColorRGBA' | 'backgroundColorString' | 'rendererMapID'
> & {
  backgroundColor: number;
  backgroundColorRGBA: number[];
  backgroundColorString: string;
  rendererMapID: number;
};
