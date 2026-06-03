import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createWebGLElement,
  createWebGLRenderState,
  defaultWebGLBitmapRenderer,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLDisplayObject,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLElement(220, 220, pixelRatio);
document.getElementById('app')!.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0x000000ff,
  contextAttributes: { alpha: false },
  imageSmoothingEnabled: false,
});
registerRenderer(state, BitmapKind, defaultWebGLBitmapRenderer);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}
