import type { DisplayObject } from '@flighthq/sdk';
import {
  createWebGLRenderState,
  defaultWebGLRichTextRenderer,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  registerRenderer,
  registerWebGLShapeCommands,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  RichTextKind,
  ShapeKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = document.createElement('canvas');
canvas.width = window.innerWidth * pixelRatio;
canvas.height = window.innerHeight * pixelRatio;
canvas.style.width = `${window.innerWidth}px`;
canvas.style.height = `${window.innerHeight}px`;
canvas.style.display = 'block';
document.body.style.margin = '0';
document.body.appendChild(canvas);

export const container = canvas;
export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0xa0a0a0ff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, RichTextKind, defaultWebGLRichTextRenderer);
registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
registerWebGLShapeCommands(defaultWebGLShapeCommands);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}

export function setSize(w: number, h: number): void {
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}
