import type { CanvasMaterialRenderer, CanvasRenderState } from '@flighthq/types';

export type CanvasRenderStateInternal = Omit<CanvasRenderState, 'canvas' | 'context' | 'contextAttributes'> & {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  contextAttributes: CanvasRenderingContext2DSettings;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  materialRendererMap?: Map<symbol, CanvasMaterialRenderer>;
};
