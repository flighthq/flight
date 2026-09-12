import { webRaster2DSurfaceProvider } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  scene3DGlPipeline,
  createGlContextState,
  createGlContextFromCanvasElement,
  QuadBatchKind,
  TextLabelKind,
  createGlCanvasElement,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlQuadBatchRenderer,
  defaultGlTextLabelRenderer,
  prepareScene2DRender,
  registerRenderer,
  renderGlScene2D,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  ),
  scene3DGlPipeline,
  {
    pixelRatio,
    backgroundColor: 0x2a2a3aff,
    sceneGraphSyncPolicy: 'requiresInvalidation',
    raster2DSurfaceProvider: webRaster2DSurfaceProvider,
  },
);
enableFlightDiagnostics(state);
registerRenderer(state, QuadBatchKind, defaultGlQuadBatchRenderer);
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderGlScene2D(state, root);
}
