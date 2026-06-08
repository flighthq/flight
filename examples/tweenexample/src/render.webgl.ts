import type { DisplayObject } from '@flighthq/sdk';
import {
  createWebGLElement,
  createWebGLRenderState,
  defaultWebGLBeginFill,
  defaultWebGLDrawCircle,
  defaultWebGLEndFill,
  defaultWebGLShapeRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  registerWebGLShapeCommands,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0xeeddccff,
});
registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
registerWebGLShapeCommands([defaultWebGLBeginFill, defaultWebGLEndFill, defaultWebGLDrawCircle]);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}
