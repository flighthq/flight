import type { Node2D } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasBeginFill,
  defaultCanvasDrawRectangle,
  defaultCanvasEndFill,
  defaultCanvasShapeRenderer,
  defaultCanvasSpriteRenderer,
  defaultCanvasTextLabelRenderer,
  enableFlightDiagnostics,
  getCanvasRenderStateTextureResolvers,
  prepareScene2DRender,
  registerCanvasImageTextureResolver,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0x87ceebff,
});
enableFlightDiagnostics(state);

registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
registerRenderer(state, TextLabelKind, defaultCanvasTextLabelRenderer);
registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
registerCanvasShapeCommands([defaultCanvasBeginFill, defaultCanvasDrawRectangle, defaultCanvasEndFill]);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
}
