import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createWebGLRenderState,
  defaultWebGLBitmapRenderer,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  defaultWebGLTextRenderer,
  prepareWebGLDisplayObjectRender,
  registerRenderer,
  registerWebGLShapeCommands,
  renderWebGL,
  renderWebGLBackground,
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
export const state = createWebGLRenderState(canvas, { backgroundColor: 0x000000ff });
registerRenderer(state, BitmapKind, defaultWebGLBitmapRenderer);
registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
registerRenderer(state, TextKind, defaultWebGLTextRenderer);
registerWebGLShapeCommands(defaultWebGLShapeCommands);
export const scale = pixelRatio;

export function setSize(w: number, h: number): void {
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

export function render(root: DisplayObject): void {
  if (!prepareWebGLDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGL(state);
}
