import type { Node2D } from '@flighthq/sdk';
import {
  scene3DGlPipeline,
  createGlContextState,
  createGlContextFromCanvasElement,
  SpriteKind,
  createGlCanvasElement,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlSpriteRenderer,
  prepareScene2DRender,
  registerRenderer,
  renderGlScene2D,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
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
    backgroundColor: 0x1a1a2eff,
    sceneGraphSyncPolicy: 'requiresInvalidation',
  },
);
const screenTarget = createGlScreenRenderTarget(state.gl);
enableFlightDiagnostics(state);
registerRenderer(state, SpriteKind, defaultGlSpriteRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginGlRenderPass(state, screenTarget);
  renderGlScene2D(pass, root);
  endGlRenderPass(pass);
}
