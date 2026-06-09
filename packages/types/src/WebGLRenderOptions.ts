import type { SceneGraphSyncPolicy } from './RenderState';

export interface WebGLRenderOptions {
  allowSmoothing?: boolean;
  antialias?: boolean;
  backgroundColor?: number;
  contextAttributes?: WebGLContextAttributes;
  imageSmoothingEnabled?: boolean;
  pixelRatio?: number;
  powerPreference?: WebGLPowerPreference;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: SceneGraphSyncPolicy;
}
