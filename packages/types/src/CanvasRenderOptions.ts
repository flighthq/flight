import type { Matrix } from './Matrix';

export interface CanvasRenderOptions {
  backgroundColor?: number | null;
  contextAttributes?: CanvasRenderingContext2DSettings;
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: ImageSmoothingQuality;
  pixelRatio?: number;
  renderTransform?: Matrix;
  roundPixels?: boolean;
}
