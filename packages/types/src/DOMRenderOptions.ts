import type { SceneGraphSyncPolicy } from './RenderState';

export interface DomRenderOptions {
  backgroundColor?: number | null;
  imageSmoothingEnabled?: boolean;
  pixelRatio?: number;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: SceneGraphSyncPolicy;
}
