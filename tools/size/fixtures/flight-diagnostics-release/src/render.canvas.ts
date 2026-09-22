import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import {
  createCanvasRenderState,
  createCanvasTextureResolvers,
  enableFlightDiagnostics,
  canvasScene2DRenderPreset,
} from '@flighthq/sdk';

enableFlightDiagnostics(
  createCanvasRenderState(canvasScene2DRenderPreset, createCanvasTextureResolvers(webCanvasRenderSurfaceCreator)),
);
