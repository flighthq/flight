import type { Node2D } from '@flighthq/sdk';
import {
  createGlContextFromCanvasElement,
  SpriteKind,
  TilemapKind,
  createGlCanvasElement,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlSpriteRenderer,
  defaultGlTilemapRenderer,
  prepareScene2DRender,
  registerStandardGlTextureResolvers,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
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

registerStandardGlTextureResolvers(state);
registerGlStandardMaterial(state);
registerRenderer(state, SpriteKind, defaultGlSpriteRenderer);
registerRenderer(state, TilemapKind, defaultGlTilemapRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderGlBackground(state);
  renderGlScene2D(state, root);
}
