import type { Matrix } from './Matrix';
import type { Scene3DGraphSyncPolicy } from './RenderState';

export interface CanvasRenderOptions {
  backgroundColor?: number | null;
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: ImageSmoothingQuality;
  pixelRatio?: number;
  renderTransform?: Matrix;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
