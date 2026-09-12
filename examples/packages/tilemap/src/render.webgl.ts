import { createWebGlContext } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  scene3DGlPipeline,
  SpriteKind,
  TilemapKind,
  createGlCanvasElement,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlSpriteRenderer,
  defaultGlTilemapRenderer,
  prepareScene2DRender,
  registerRenderer,
  renderGlScene2D,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createWebGlContext(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  scene3DGlPipeline,
  {
    pixelRatio,
    sceneGraphSyncPolicy: 'requiresInvalidation',
  },
);
const screenTarget = createGlScreenRenderTarget(state.gl);
enableFlightDiagnostics(state);
registerRenderer(state, SpriteKind, defaultGlSpriteRenderer);
registerRenderer(state, TilemapKind, defaultGlTilemapRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginGlRenderPass(state, screenTarget);
  renderGlScene2D(pass, root);
  endGlRenderPass(pass);
}
