import type { DisplayObject } from '@flighthq/sdk';
import {
  QuadBatchKind,
  TextLabelKind,
  createGlCanvasElement,
  createGlRenderState,
  createMatrix,
  defaultGlQuadBatchRenderer,
  defaultGlTextLabelRenderer,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x2a2a3aff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

registerDefaultGlMaterial(state);
registerRenderer(state, QuadBatchKind, defaultGlQuadBatchRenderer);
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);

export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
}
