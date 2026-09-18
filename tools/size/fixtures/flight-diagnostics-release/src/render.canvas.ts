import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import {
  createCanvasRenderState,
  createCanvasTextureResolvers,
  enableFlightDiagnostics,
  defaultScene2DCanvasRenderRegistry,
} from '@flighthq/sdk';

enableFlightDiagnostics(
  createCanvasRenderState(
    defaultScene2DCanvasRenderRegistry,
    createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  ),
);
