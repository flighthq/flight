import type { DisplayObject } from '@flighthq/sdk';
import {
  createWebGLCanvasElement,
  createWebGLRenderState,
  defaultWebGLRichTextRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  RichTextKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0xffffffff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, RichTextKind, defaultWebGLRichTextRenderer);
export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}
