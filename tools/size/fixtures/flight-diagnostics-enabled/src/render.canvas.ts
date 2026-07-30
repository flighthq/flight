import { createCanvasRenderState, enableFlightDiagnostics } from '@flighthq/sdk';

enableFlightDiagnostics(createCanvasRenderState(document.createElement('canvas')));
