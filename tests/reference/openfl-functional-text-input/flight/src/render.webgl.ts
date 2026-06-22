import type { DisplayObject } from '@flighthq/sdk';
import {
  createGlCanvasElement,
  createGlRenderState,
  defaultGlRichTextRenderer,
  enableGlTextInput,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
  RichTextKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 300, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  backgroundColor: 0xffffffff,
  pixelRatio,
  contextAttributes: { preserveDrawingBuffer: true },
});
registerRenderer(state, RichTextKind, defaultGlRichTextRenderer);
registerDefaultGlMaterial(state);
// Opt the RichText renderer into rasterizing the editable-input caret/selection overlay.
enableGlTextInput();
export const scale = pixelRatio;
export const width = 800;
export const height = 300;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
}
