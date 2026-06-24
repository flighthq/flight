import type { DisplayObject } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasRichTextRenderer,
  enableCanvasTextInputSupport,
  prepareDisplayObjectRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  RichTextKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 300, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, { backgroundColor: 0xffffffff, pixelRatio });
registerRenderer(state, RichTextKind, defaultCanvasRichTextRenderer);
// Opt the RichText renderer into drawing the editable-input caret/selection overlay.
enableCanvasTextInputSupport();
export const scale = pixelRatio;
export const width = 800;
export const height = 300;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}
