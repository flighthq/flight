import { webRaster2DSurfaceProvider } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  scene3DGlPipeline,
  createGlContextState,
  createGlContextFromCanvasElement,
  createGlCanvasElement,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlParticleEmitter2DRenderer,
  defaultGlTextLabelRenderer,
  enableGlBlendModeSupport,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
  TextLabelKind,
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
    backgroundColor: 0x0a0a14ff,
    sceneGraphSyncPolicy: 'requiresInvalidation',
    raster2DSurfaceProvider: webRaster2DSurfaceProvider,
  },
);
enableFlightDiagnostics(state);
registerRenderer(state, ParticleEmitter2DKind, defaultGlParticleEmitter2DRenderer);
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);
enableGlBlendModeSupport(state);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderGlBackground(state);
  renderGlScene2D(state, root);
}
