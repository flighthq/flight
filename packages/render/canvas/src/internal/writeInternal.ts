import type { CanvasRendererState } from '@flighthq/types';

export type CanvasRendererStateInternal = Omit<CanvasRendererState, 'canvas' | 'context' | 'contextAttributes'> & {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  contextAttributes: CanvasRenderingContext2DSettings;
};
