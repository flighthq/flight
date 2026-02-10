import type { Affine2D } from '@flighthq/math';

export type CanvasRendererOptions = {
  backgroundColor?: number | null;
  contextAttributes?: CanvasRenderingContext2DSettings;
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: ImageSmoothingQuality;
  pixelRatio?: number;
  renderTransform?: Affine2D;
  roundPixels?: boolean;
};
