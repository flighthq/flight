import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createCanvasRenderState,
  defaultCanvasBitmapRenderer,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  defaultCanvasTextRenderer,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  ShapeKind,
  TextKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = document.createElement('canvas');
canvas.width = window.innerWidth * pixelRatio;
canvas.height = window.innerHeight * pixelRatio;
canvas.style.width = `${window.innerWidth}px`;
canvas.style.height = `${window.innerHeight}px`;
document.body.appendChild(canvas);

export const container = canvas;
export const state = createCanvasRenderState(canvas, { backgroundColor: 0x000000ff });
registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerRenderer(state, TextKind, defaultCanvasTextRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
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
