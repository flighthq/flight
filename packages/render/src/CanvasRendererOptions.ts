import type { Matrix3 } from '@flighthq/math';

export type CanvasRendererOptions = {
  backgroundColor?: number | null;
  contextAttributes?: CanvasRenderingContext2DSettings;
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: ImageSmoothingQuality;
  pixelRatio?: number;
  renderTransform?: Matrix3;
  roundPixels?: boolean;
};
