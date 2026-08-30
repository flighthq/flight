import type { Node2D } from '@flighthq/sdk';
import {
  scene2dGlPipeline,
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
  registerStandardGlTextureResolvers,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  ),
  scene2dGlPipeline,
  {
    pixelRatio,
    backgroundColor: 0x2a2a3aff,
    sceneGraphSyncPolicy: 'requiresInvalidation',
  },
);
enableFlightDiagnostics(state);

registerStandardGlTextureResolvers(state);
registerGlStandardMaterial(state);
registerRenderer(state, QuadBatchKind, defaultGlQuadBatchRenderer);
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderGlBackground(state);
  renderGlScene2D(state, root);
}
