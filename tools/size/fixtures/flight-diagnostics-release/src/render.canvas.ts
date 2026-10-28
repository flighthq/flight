import { webHostCanvas } from '@flighthq/host-web';
import {
  createCanvasRenderState,
  enableFlightDiagnostics,
  canvasScene2DRenderPreset,
  createLogState,
  createDebugState,
} from '@flighthq/sdk';

const logState = createLogState();
enableFlightDiagnostics(
  createDebugState(),
  logState,
  createCanvasRenderState({ ...canvasScene2DRenderPreset, canvasHost: webHostCanvas }),
);
