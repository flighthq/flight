import type { Raster2DSurfaceProvider } from './Raster2DSurface';
import type { Scene3DGraphSyncPolicy } from './RenderState';

export interface GlRenderOptions {
  allowSmoothing?: boolean;
  imageSmoothingEnabled?: boolean;
  // Pixel ratio is render configuration: createGlRenderState consumes it while the caller owns and
  // sizes the surface independently.
  pixelRatio?: number;
  raster2DSurfaceProvider?: Readonly<Raster2DSurfaceProvider>;
  roundPixels?: boolean;
  sceneGraphSyncPolicy?: Scene3DGraphSyncPolicy;
}
