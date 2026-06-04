import type { DisplayObject } from '@flighthq/sdk';
import {
  createWebGLElement,
  createWebGLRenderState,
  defaultWebGLTextRenderer,
  prepareWebGLDisplayObjectRender,
  registerRenderer,
  renderWebGL,
  renderWebGLBackground,
  TextKind,
} from '@flighthq/sdk';

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
  if (!prepareWebGLDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGL(state);
}
