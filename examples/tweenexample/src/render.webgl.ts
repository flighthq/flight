import type { DisplayObject } from '@flighthq/engine';
import {
  createWebGLElement,
  createWebGLRenderState,
  defaultWebGLBeginFill,
  defaultWebGLDrawCircle,
  defaultWebGLEndFill,
  defaultWebGLShapeRenderer,
  registerRenderer,
  registerWebGLShapeCommands,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  ShapeKind,
} from '@flighthq/engine';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
registerWebGLShapeCommands([defaultWebGLBeginFill, defaultWebGLEndFill, defaultWebGLDrawCircle]);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}
