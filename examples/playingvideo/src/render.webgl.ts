import type { DisplayObject } from '@flighthq/sdk';
import {
  createWebGLRenderState,
  defaultWebGLShapeCommands,
  defaultWebGLVideoRenderer,
  prepareWebGLDisplayObjectRender,
  registerRenderer,
  registerWebGLShapeCommands,
  renderWebGL,
  renderWebGLBackground,
  VideoKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = document.createElement('canvas');
canvas.width = window.innerWidth * pixelRatio;
canvas.height = window.innerHeight * pixelRatio;
canvas.style.width = `${window.innerWidth}px`;
canvas.style.height = `${window.innerHeight}px`;
canvas.style.display = 'block';
document.body.style.margin = '0';
document.body.style.background = '#000';
document.body.appendChild(canvas);

export const container = canvas;
export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0x000000ff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, VideoKind, defaultWebGLVideoRenderer);
registerWebGLShapeCommands(defaultWebGLShapeCommands);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareWebGLDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGL(state);
}

export function setSize(w: number, h: number): void {
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}
