import type { HostCanvasCapability } from './HostCanvas.ts';
import type { HostImageCapability } from './ImageResource.ts';
import type { Scene3DGraphSyncPolicy } from './RenderState.ts';

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
