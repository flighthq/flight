import type { Matrix } from './Matrix';
import type { SceneGraphSyncPolicy } from './RenderState';

export interface CanvasRenderOptions {
  backgroundColor?: number | null;
  contextAttributes?: CanvasRenderingContext2DSettings;
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: ImageSmoothingQuality;
  pixelRatio?: number;
  renderTransform?: Matrix;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: SceneGraphSyncPolicy;
}
