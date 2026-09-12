import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  beginCanvasRenderPass,
  createCanvasElement,
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasScreenRenderTarget,
  createCanvasTextureResolvers,
  defaultCanvasBeginFill,
  defaultCanvasDrawRectangle,
  defaultCanvasEndFill,
  defaultCanvasShapeRenderer,
  defaultCanvasSpriteRenderer,
  defaultCanvasTextLabelRenderer,
  enableFlightDiagnostics,
  endCanvasRenderPass,
  getCanvasRenderStateTextureResolvers,
  prepareScene2DRender,
  registerCanvasImageTextureResolver,
  registerCanvasShapeCommands,
  registerCanvasSurfaceCreator,
  registerRenderer,
  renderCanvasScene2D,
  scene2DCanvasPipeline,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(webCanvasRenderSurfaceCreator, 800, 500, pixelRatio);
document.body.appendChild(canvas);

export const screen = createCanvasScreenRenderTarget(
  createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, {
    height: canvas.height / pixelRatio,
    pixelRatio,
    width: canvas.width / pixelRatio,
  }),
);
export const state = createCanvasRenderState(
  scene2DCanvasPipeline,
  createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  { sceneGraphSyncPolicy: 'requiresInvalidation' },
);
registerCanvasSurfaceCreator(state, webCanvasRenderSurfaceCreator);
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x87 / 0xff, 0xce / 0xff, 0xeb / 0xff, 1] } as const;
enableFlightDiagnostics(state);

registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
registerRenderer(state, TextLabelKind, defaultCanvasTextLabelRenderer);
registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
registerCanvasShapeCommands(state, [defaultCanvasBeginFill, defaultCanvasDrawRectangle, defaultCanvasEndFill]);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginCanvasRenderPass(state, screen, screenClear);
  renderCanvasScene2D(pass, root);
  endCanvasRenderPass(pass);
}
