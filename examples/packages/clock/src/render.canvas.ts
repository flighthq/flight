import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderSurface,
  createCanvasTextureResolvers,
  scene2dCanvasPipeline,
  createCanvasRenderState,
  enableFlightDiagnostics,
  defaultCanvasBeginFill,
  defaultCanvasDrawCircle,
  defaultCanvasDrawRectangle,
  defaultCanvasEndFill,
  defaultCanvasLineStyle,
  defaultCanvasLineTo,
  defaultCanvasMoveTo,
  defaultCanvasShapeRenderer,
  defaultCanvasTextLabelRenderer,
  prepareScene2DRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(webCanvasRenderSurfaceCreator, 800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(
  createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, {
    height: canvas.height / pixelRatio,
    pixelRatio,
    width: canvas.width / pixelRatio,
  }),
  scene2dCanvasPipeline,
  createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  {
    sceneGraphSyncPolicy: 'requiresInvalidation',
    backgroundColor: 0x1a1a2eff,
  },
);
enableFlightDiagnostics(state);

registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerRenderer(state, TextLabelKind, defaultCanvasTextLabelRenderer);
registerCanvasShapeCommands(state, [
  defaultCanvasBeginFill,
  defaultCanvasDrawCircle,
  defaultCanvasDrawRectangle,
  defaultCanvasEndFill,
  defaultCanvasLineStyle,
  defaultCanvasLineTo,
  defaultCanvasMoveTo,
]);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
}
