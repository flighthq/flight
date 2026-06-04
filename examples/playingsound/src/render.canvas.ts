import type { DisplayObject } from '@flighthq/sdk';
import {
  createCanvasRenderState,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  prepareCanvasDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvas,
  renderCanvasBackground,
  ShapeKind,
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
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareCanvasDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvas(state);
}

export function setSize(w: number, h: number): void {
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}
