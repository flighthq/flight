import type { Node2D } from '@flighthq/sdk';
import {
  createGlContextFromCanvasElement,
  SpriteKind,
  createGlCanvasElement,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlSpriteRenderer,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  {
    pixelRatio,
    backgroundColor: 0x1a1a2eff,
    sceneGraphSyncPolicy: 'requiresInvalidation',
  },
);
enableFlightDiagnostics(state);

registerGlStandardMaterial(state);
registerStandardGlTextureResolvers(state);
registerRenderer(state, SpriteKind, defaultGlSpriteRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderGlBackground(state);
  renderGlScene2D(state, root);
}
