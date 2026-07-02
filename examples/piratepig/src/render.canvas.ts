import { createBlurFilter } from '@flighthq/filters';
import { computeBlurFilterCss } from '@flighthq/filters-css';
import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createCanvasRenderState,
  defaultCanvasBitmapRenderer,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  defaultCanvasTextLabelRenderer,
  enableCanvasCssFilter,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  setCanvasCssFilter,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = document.createElement('canvas');
canvas.width = window.innerWidth * pixelRatio;
canvas.height = window.innerHeight * pixelRatio;
canvas.style.width = `${window.innerWidth}px`;
canvas.style.height = `${window.innerHeight}px`;
document.body.appendChild(canvas);

export const container = canvas;
export const state = createCanvasRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0x000000ff,
});
registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerRenderer(state, TextLabelKind, defaultCanvasTextLabelRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
enableCanvasCssFilter(state);
export const scale = pixelRatio;

export function setSize(w: number, h: number): void {
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}

// OpenFL: Background.filters = [new BlurFilter(10, 10)] — a CSS filter applied at draw. The
// returned callback is a no-op: the filter re-applies on every draw, so resizes need no re-bake.
export function applyBackgroundBlur(node: DisplayObject): () => void {
  setCanvasCssFilter(state, node, computeBlurFilterCss(createBlurFilter({ blurX: 10, blurY: 10 })));
  return () => {};
}
