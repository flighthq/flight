import type { Node2D } from '@flighthq/sdk';
import {
  createGlCanvasElement,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  defaultGlSpriteRenderer,
  defaultGlTextLabelRenderer,
  prepareScene2DRender,
  registerStandardGlTextureResolvers,
  registerGlStandardMaterial,
  registerGlShapeCommands,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x87ceebff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerGlStandardMaterial(state);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerRenderer(state, SpriteKind, defaultGlSpriteRenderer);
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);
registerStandardGlTextureResolvers(state);
registerGlShapeCommands(defaultGlShapeCommands);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderGlBackground(state);
  renderGlScene2D(state, root);
}
