import type { DisplayObject } from '@flighthq/sdk';
import {
  createWebGLCanvasElement,
  createWebGLRenderState,
  defaultWebGLRichTextRenderer,
  enableWebGLTextInput,
  prepareDisplayObjectRender,
  registerDefaultWebGLMaterial,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  RichTextKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLCanvasElement(800, 300, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0xffffffff,
  pixelRatio,
  contextAttributes: { preserveDrawingBuffer: true },
});
registerRenderer(state, RichTextKind, defaultWebGLRichTextRenderer);
registerDefaultWebGLMaterial(state);
// Opt the RichText renderer into rasterizing the editable-input caret/selection overlay.
enableWebGLTextInput();
export const scale = pixelRatio;
export const width = 800;
export const height = 300;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}
