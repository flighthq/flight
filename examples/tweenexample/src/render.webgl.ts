import type { DisplayObject } from '@flighthq/sdk';
import {
  createWebGLCanvasElement,
  createWebGLRenderState,
  defaultWebGLBeginFill,
  defaultWebGLDrawCircle,
  defaultWebGLEndFill,
  defaultWebGLShapeRenderer,
  prepareDisplayObjectRender,
  registerDefaultWebGLMaterial,
  registerRenderer,
  registerWebGLShapeCommands,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
});
registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
registerWebGLShapeCommands([defaultWebGLBeginFill, defaultWebGLEndFill, defaultWebGLDrawCircle]);
registerDefaultWebGLMaterial(state);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}
