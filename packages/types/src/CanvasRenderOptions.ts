import type { Matrix } from './Matrix';
import type { Scene3DGraphSyncPolicy } from './RenderState';

export interface CanvasRenderOptions {
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: ImageSmoothingQuality;
  pixelRatio?: number;
  renderTransform?: Matrix;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
