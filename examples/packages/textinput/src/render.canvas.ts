import type { Node2D } from '@flighthq/sdk';
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
  prepareScene2DRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
  RichTextKind,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';
import { enableCanvasTextInput } from '@flighthq/sdk/rendering';

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

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
}
