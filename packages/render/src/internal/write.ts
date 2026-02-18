import type { RendererState } from '@flighthq/types';

export type RendererStateInternal = Omit<
  RendererState,
  'backgroundColor' | 'backgroundColorRGBA' | 'backgroundColorString'
> & {
  backgroundColor: number;
  backgroundColorRGBA: number[];
  backgroundColorString: string;
};
