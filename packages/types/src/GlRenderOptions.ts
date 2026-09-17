import type { ImageSurfaceCreator } from './ImageSurface';
import type { Scene3DGraphSyncPolicy } from './RenderState';

export interface GlRenderOptions {
  allowSmoothing?: boolean;
  imageSmoothingEnabled?: boolean;
  // Pixel ratio is render configuration: createGlRenderState consumes it while the caller owns and
  // sizes the surface independently.
  pixelRatio?: number;
  imageSurfaceProvider?: Readonly<ImageSurfaceCreator>;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
