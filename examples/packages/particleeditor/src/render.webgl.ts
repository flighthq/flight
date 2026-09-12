import { webRaster2DSurfaceProvider } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  scene3DGlPipeline,
  createGlContext,
  createGlCanvasElement,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlParticleEmitter2DRenderer,
  defaultGlTextLabelRenderer,
  enableGlBlendModeSupport,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  registerRenderer,
  renderGlScene2D,
  TextLabelKind,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContext(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  scene3DGlPipeline,
  {
    pixelRatio,
    sceneGraphSyncPolicy: 'requiresInvalidation',
    raster2DSurfaceProvider: webRaster2DSurfaceProvider,
  },
);
const screenTarget = createGlScreenRenderTarget(state.gl);
enableFlightDiagnostics(state);
registerRenderer(state, ParticleEmitter2DKind, defaultGlParticleEmitter2DRenderer);
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);
enableGlBlendModeSupport(state);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginGlRenderPass(state, screenTarget);
  renderGlScene2D(pass, root);
  endGlRenderPass(pass);
}
