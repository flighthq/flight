import type { Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  TextLabelKind,
  createGlCanvasElement,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  defaultGlTextLabelRenderer,
  prepareScene2DRender,
  registerStandardGlTextureResolvers,
  registerStandardGlMaterial,
  registerGlShapeCommands,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.style.margin = '0';
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  backgroundColor: 0x101827ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerStandardGlTextureResolvers(state);
registerStandardGlMaterial(state);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);
registerGlShapeCommands(defaultGlShapeCommands);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderGlBackground(state);
  renderGlScene2D(state, root);
}
