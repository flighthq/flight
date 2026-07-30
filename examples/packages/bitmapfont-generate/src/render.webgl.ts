import type { Node2D } from '@flighthq/sdk';
import {
  SpriteKind,
  createGlCanvasElement,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlSpriteRenderer,
  defaultGlQuadBatchRenderer,
  prepareScene2DRender,
  QuadBatchKind,
  registerStandardGlTextureResolvers,
  registerStandardGlMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x111827ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerStandardGlTextureResolvers(state);
registerStandardGlMaterial(state);
registerRenderer(state, SpriteKind, defaultGlSpriteRenderer);
registerRenderer(state, QuadBatchKind, defaultGlQuadBatchRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderGlBackground(state);
  renderGlScene2D(state, root);
}
