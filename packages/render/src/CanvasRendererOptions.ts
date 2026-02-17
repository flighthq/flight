import type { Matrix3x2 } from '@flighthq/types';

export type CanvasRendererOptions = {
  backgroundColor?: number | null;
  contextAttributes?: CanvasRenderingContext2DSettings;
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: ImageSmoothingQuality;
  pixelRatio?: number;
  renderTransform?: Matrix3x2;
  roundPixels?: boolean;
};
