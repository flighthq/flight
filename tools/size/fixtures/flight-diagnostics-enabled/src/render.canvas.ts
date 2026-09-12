import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import {
  createCanvasRenderState,
  createCanvasTextureResolvers,
  enableFlightDiagnostics,
  scene2DCanvasPipeline,
} from '@flighthq/sdk';

enableFlightDiagnostics(
  createCanvasRenderState(scene2DCanvasPipeline, createCanvasTextureResolvers(webCanvasRenderSurfaceCreator)),
);
