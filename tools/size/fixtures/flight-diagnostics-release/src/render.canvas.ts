import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import {
  createCanvasRenderState,
  createCanvasTextureResolvers,
  enableFlightDiagnostics,
  defaultScene2DCanvasRenderRegistries,
} from '@flighthq/sdk';

enableFlightDiagnostics(
  createCanvasRenderState(
    defaultScene2DCanvasRenderRegistries,
    createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  ),
);
