import type { Matrix3x2 } from '../../geometry';

export interface CanvasRenderOptions {
  backgroundColor?: number | null;
  contextAttributes?: CanvasRenderingContext2DSettings;
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: ImageSmoothingQuality;
  pixelRatio?: number;
  renderTransform?: Matrix3x2;
  roundPixels?: boolean;
}
