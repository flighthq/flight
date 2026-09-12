import type { Raster2DSurfaceProvider } from './Raster2DSurface';
import type { Scene3DGraphSyncPolicy } from './RenderState';

export interface WgpuRenderOptions {
  // The state's immutable render-target format: the format its scene pipelines compile against and the
  // default for targets it allocates. Defaults to 'bgra8unorm'; pass the screen target's format when
  // the state renders to a screen whose swap chain uses another one.
  format?: GPUTextureFormat;
  imageSmoothingEnabled?: boolean;
  pixelRatio?: number;
  raster2DSurfaceProvider?: Readonly<Raster2DSurfaceProvider>;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
