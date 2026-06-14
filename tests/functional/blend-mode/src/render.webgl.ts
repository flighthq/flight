import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createWebGLCanvasElement,
  createWebGLRenderState,
  defaultWebGLBitmapRenderer,
  defaultWebGLRichTextRenderer,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  enableWebGLBlendModeSupport,
  prepareDisplayObjectRender,
  registerRenderer,
  registerWebGLShapeCommands,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  RichTextKind,
  ShapeKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLCanvasElement(1100, 700, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0xffffffff,
  contextAttributes: { alpha: false },
});
enableWebGLBlendModeSupport(state);
registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
registerWebGLShapeCommands(defaultWebGLShapeCommands);
registerRenderer(state, BitmapKind, defaultWebGLBitmapRenderer);
registerRenderer(state, RichTextKind, defaultWebGLRichTextRenderer);
export const scale = pixelRatio;
export const width = 1100;
export const height = 700;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}
