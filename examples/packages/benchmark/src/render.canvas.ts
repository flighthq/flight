import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  beginCanvasRenderPass,
  createCanvasElement,
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasScreenRenderTarget,
  createCanvasTextureResolvers,
  defaultCanvasQuadBatchRenderer,
  defaultCanvasTextLabelRenderer,
  enableFlightDiagnostics,
  endCanvasRenderPass,
  getCanvasRenderStateTextureResolvers,
  prepareScene2DRender,
  QuadBatchKind,
  registerCanvasImageTextureResolver,
  registerCanvasSurfaceCreator,
  registerRenderer,
  renderCanvasScene2D,
  scene2DCanvasPipeline,
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
const screenClear = { color: [0x2a / 0xff, 0x2a / 0xff, 0x3a / 0xff, 1] } as const;
enableFlightDiagnostics(state);
registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
registerRenderer(state, QuadBatchKind, defaultCanvasQuadBatchRenderer);
registerRenderer(state, TextLabelKind, defaultCanvasTextLabelRenderer);
export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginCanvasRenderPass(state, screen, screenClear);
  renderCanvasScene2D(pass, root);
  endCanvasRenderPass(pass);
}
