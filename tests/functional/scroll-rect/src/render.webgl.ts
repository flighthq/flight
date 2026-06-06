import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createWebGLElement,
  createWebGLRenderState,
  defaultWebGLBitmapRenderer,
  defaultWebGLRichTextRenderer,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  enableWebGLScrollRectangleSupport,
  prepareDisplayObjectRender,
  registerRenderer,
  registerWebGLShapeCommands,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  RichTextKind,
  ShapeKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLElement(1280, 720, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0xff000000,
  contextAttributes: { alpha: false },
});
enableWebGLScrollRectangleSupport(state);
registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
registerWebGLShapeCommands(defaultWebGLShapeCommands);
registerRenderer(state, BitmapKind, defaultWebGLBitmapRenderer);
registerRenderer(state, RichTextKind, defaultWebGLRichTextRenderer);
export const scale = pixelRatio;
export const width = 1280;
export const height = 720;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}
