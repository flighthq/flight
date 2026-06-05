import type { DisplayObject } from '@flighthq/sdk';
import {
  createCanvasRenderState,
  defaultCanvasRichTextRenderer,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  RichTextKind,
  ShapeKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = document.createElement('canvas');
canvas.width = window.innerWidth * pixelRatio;
canvas.height = window.innerHeight * pixelRatio;
canvas.style.width = `${window.innerWidth}px`;
canvas.style.height = `${window.innerHeight}px`;
document.body.style.margin = '0';
document.body.appendChild(canvas);

export const container = canvas;
export const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xa0a0a0ff,
  pixelRatio,
  contextAttributes: { alpha: false },
});
registerRenderer(state, RichTextKind, defaultCanvasRichTextRenderer);
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}

export function setSize(w: number, h: number): void {
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}
