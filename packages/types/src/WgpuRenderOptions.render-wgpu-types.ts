import type { HostCanvasCapability } from './HostCanvas.ts';
import type { HostImageCapability } from './ImageResource.ts';
import type { Scene3DGraphSyncPolicy } from './RenderState.ts';

export interface WgpuRenderOptions {
  canvasHost?: Readonly<HostCanvasCapability>;
  imageHost?: Readonly<HostImageCapability>;
  // The state's immutable render-target format: the format its scene pipelines compile against and the
  // default for targets it allocates. Defaults to 'bgra8unorm'; pass the screen target's format when
  // the state renders to a screen whose swap chain uses another one.
  format?: GPUTextureFormat;
  imageSmoothingEnabled?: boolean;
  pixelRatio?: number;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
