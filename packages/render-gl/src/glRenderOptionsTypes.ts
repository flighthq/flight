import type { Scene3DGraphSyncPolicy } from '@flighthq/render/contract';
import type { HostCanvasCapability, HostImageCapability } from '@flighthq/types/contract';

export interface GlRenderOptions {
  allowSmoothing?: boolean;
  canvasHost?: Readonly<HostCanvasCapability>;
  imageHost?: Readonly<HostImageCapability>;
  imageSmoothingEnabled?: boolean;
  // Pixel ratio is render configuration: createGlRenderState consumes it while the caller owns and
  // sizes the surface independently.
  pixelRatio?: number;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
