import type { SceneGraphSyncPolicy } from './RenderState';

export interface WebGPURenderOptions {
  antialias?: boolean;
  backgroundColor?: number;
  format?: GPUTextureFormat;
  imageSmoothingEnabled?: boolean;
  pixelRatio?: number;
  powerPreference?: GPUPowerPreference;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: SceneGraphSyncPolicy;
}
