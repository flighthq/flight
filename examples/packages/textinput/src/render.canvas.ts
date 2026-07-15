import { enableCanvasTextInput } from '@flighthq/displayobject-canvas';
import type { DisplayObject } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasBeginFill,
  defaultCanvasDrawRectangle,
  defaultCanvasEndFill,
  defaultCanvasLineStyle,
  defaultCanvasLineTo,
  defaultCanvasMoveTo,
  defaultCanvasRichTextRenderer,
  defaultCanvasShapeRenderer,
  defaultCanvasTextLabelRenderer,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  RichTextKind,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.style.margin = '0';
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xd0d0d0ff,
  pixelRatio,
});

registerRenderer(state, RichTextKind, defaultCanvasRichTextRenderer);
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerRenderer(state, TextLabelKind, defaultCanvasTextLabelRenderer);
registerCanvasShapeCommands([
  defaultCanvasBeginFill,
  defaultCanvasDrawRectangle,
  defaultCanvasEndFill,
  defaultCanvasLineStyle,
  defaultCanvasLineTo,
  defaultCanvasMoveTo,
]);
enableCanvasTextInput();

export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}
