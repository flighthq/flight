import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasBitmapRenderer,
  defaultCanvasRichTextRenderer,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  enableCanvasScrollRectangleSupport,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  RichTextKind,
  ShapeKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(1280, 720, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xff000000,
  contextAttributes: { alpha: false },
});
enableCanvasScrollRectangleSupport(state);
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);
registerRenderer(state, RichTextKind, defaultCanvasRichTextRenderer);
export const scale = pixelRatio;
export const width = 1280;
export const height = 720;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}
