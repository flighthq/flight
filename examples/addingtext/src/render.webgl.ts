import type { DisplayObject } from '@flighthq/engine';
import {
  createWebGLElement,
  createWebGLRenderState,
  defaultWebGLTextRenderer,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  TextKind,
} from '@flighthq/engine';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLElement(400, 200, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0xffffffff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, TextKind, defaultWebGLTextRenderer);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}
