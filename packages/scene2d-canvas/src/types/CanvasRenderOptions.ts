import type { Scene3DGraphSyncPolicy } from '@flighthq/render/contract';

export interface CanvasRenderOptions {
  imageSmoothingEnabled?: boolean;
  imageSmoothingQuality?: ImageSmoothingQuality;
  pixelRatio?: number;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
