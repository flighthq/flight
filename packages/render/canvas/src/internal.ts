import type { CanvasRenderState } from '@flighthq/types';

export type CanvasRenderStateInternal = Omit<CanvasRenderState, 'canvas' | 'context' | 'contextAttributes'> & {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  contextAttributes: CanvasRenderingContext2DSettings;
};
