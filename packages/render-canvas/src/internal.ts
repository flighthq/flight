import type { CanvasRenderState, ImageSource } from '@flighthq/types';

export type CanvasRenderStateInternal = Omit<CanvasRenderState, 'canvas' | 'context' | 'contextAttributes'> & {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  contextAttributes: CanvasRenderingContext2DSettings;
  imageCacheBoundsX: number;
  imageCacheBoundsY: number;
  imageCacheSource: ImageSource | null;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  skipImageCache: boolean;
};
