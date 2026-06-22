import type { SceneGraphSyncPolicy } from './RenderState';

export interface WgpuRenderOptions {
  antialias?: boolean;
  backgroundColor?: number;
  format?: GPUTextureFormat;
  imageSmoothingEnabled?: boolean;
  pixelRatio?: number;
  powerPreference?: GPUPowerPreference;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: SceneGraphSyncPolicy;
}
