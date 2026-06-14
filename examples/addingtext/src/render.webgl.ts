import type { DisplayObject } from '@flighthq/sdk';
import {
  createWebGLCanvasElement,
  createWebGLRenderState,
  defaultWebGLTextRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  TextKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLCanvasElement(400, 200, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xffffffff,
});
registerRenderer(state, TextKind, defaultWebGLTextRenderer);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}
