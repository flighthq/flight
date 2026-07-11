import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createBlurEffect,
  createCanvasRenderState,
  defaultCanvasBitmapRenderer,
  defaultCanvasBeginFill,
  defaultCanvasDrawRectangle,
  defaultCanvasEndFill,
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
registerCanvasShapeCommands([defaultCanvasBeginFill, defaultCanvasDrawRectangle, defaultCanvasEndFill]);
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

// A BlurEffect on the score panel, realized as a CSS filter applied at draw. BlurEffect's blurX is
// the Gaussian sigma in pixels, which CSS `blur(Xpx)` matches directly, so the string is built from
// the descriptor (effects ships no CSS-emitter package). The returned callback is a no-op: the
// filter re-applies on every draw, so resizes need no re-bake.
export function applyBackgroundBlur(node: DisplayObject): () => void {
  const blur = createBlurEffect({ blurX: 10, blurY: 10 });
  setCanvasCssFilter(state, node, `blur(${blur.blurX ?? 0}px)`);
  return () => {};
}
