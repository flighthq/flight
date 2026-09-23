import type { HostCanvasCapability } from './HostCanvas';
import type { HostImageCapability } from './ImageResource';
import type { Scene3DGraphSyncPolicy } from './RenderState';

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
