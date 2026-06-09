import type { SceneGraphSyncPolicy } from './RenderState';

export interface DOMRenderOptions {
  backgroundColor?: number | null;
  imageSmoothingEnabled?: boolean;
  pixelRatio?: number;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: SceneGraphSyncPolicy;
}
