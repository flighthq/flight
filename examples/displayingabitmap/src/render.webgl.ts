import type { DisplayObject } from '@flighthq/engine';
import {
  BitmapKind,
  createWebGLElement,
  createWebGLRenderState,
  defaultWebGLBitmapRenderer,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLDisplayObject,
} from '@flighthq/engine';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, BitmapKind, defaultWebGLBitmapRenderer);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}
