import type { Scene3DGraphSyncPolicy } from './RenderState';
export interface DomRenderOptions {
  backgroundColor?: number | null;
  imageSmoothingEnabled?: boolean;
  pixelRatio?: number;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
