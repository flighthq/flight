import { webHostCanvas } from '@flighthq/host-web';
import { createCanvasRenderState, enableFlightDiagnostics, canvasScene2DRenderPreset } from '@flighthq/sdk';

enableFlightDiagnostics(createCanvasRenderState({ ...canvasScene2DRenderPreset, canvasHost: webHostCanvas }));
