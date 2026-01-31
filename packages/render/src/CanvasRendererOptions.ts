import type { Matrix2D } from '@flighthq/math';

export type CanvasRendererOptions = {
  backgroundColor?: number | null;
  contextAttributes?: CanvasRenderingContext2DSettings;
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: ImageSmoothingQuality;
  pixelRatio?: number;
  renderTransform?: Matrix2D;
  roundPixels?: boolean;
};
