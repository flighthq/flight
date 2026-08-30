import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import {
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasTextureResolvers,
  enableFlightDiagnostics,
  scene2dCanvasPipeline,
} from '@flighthq/sdk';

enableFlightDiagnostics(
  createCanvasRenderState(
    createCanvasRenderSurface(webCanvasRenderSurfaceCreator, document.createElement('canvas')),
    scene2dCanvasPipeline,
    createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  ),
);
