import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import {
  createCanvasRenderState,
  createCanvasTextureResolvers,
  enableFlightDiagnostics,
  canvasScene2DRenderRegistries,
} from '@flighthq/sdk';

enableFlightDiagnostics(
  createCanvasRenderState(canvasScene2DRenderRegistries, createCanvasTextureResolvers(webCanvasRenderSurfaceCreator)),
);
