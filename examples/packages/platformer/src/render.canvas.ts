import { webHostCanvas } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  beginCanvasRenderPass,
  createCanvasElement,
  createCanvasRenderState,
  createCanvasScreenRenderTarget,
  createCanvasTextureResolvers,
  canvasBeginFill,
  canvasDrawRectangle,
  canvasEndFill,
  canvasShapeRenderer,
  canvasSpriteRenderer,
  canvasTextLabelRenderer,
  enableFlightDiagnostics,
  endCanvasRenderPass,
  getCanvasRenderStateTextureResolvers,
  prepareScene2DRender,
  registerCanvasImageTextureResolver,
  registerCanvasShapeCommands,
  registerCanvasHost,
  registerNodeRenderer,
  renderCanvasScene2D,
  canvasScene2DRenderPreset,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const surface = createCanvasElement(webHostCanvas, 800, 500, pixelRatio);
export const canvas = surface.context.canvas as HTMLCanvasElement;
document.body.appendChild(canvas);

export const screen = createCanvasScreenRenderTarget(surface);
export const state = createCanvasRenderState(canvasScene2DRenderPreset, createCanvasTextureResolvers(webHostCanvas), {
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerCanvasHost(state, webHostCanvas);
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x87 / 0xff, 0xce / 0xff, 0xeb / 0xff, 1] } as const;
enableFlightDiagnostics(state);

registerNodeRenderer(state, ShapeKind, canvasShapeRenderer);
registerNodeRenderer(state, SpriteKind, canvasSpriteRenderer);
registerNodeRenderer(state, TextLabelKind, canvasTextLabelRenderer);
registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
registerCanvasShapeCommands(state, [canvasBeginFill, canvasDrawRectangle, canvasEndFill]);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginCanvasRenderPass(state, screen, screenClear);
  renderCanvasScene2D(pass, root);
  endCanvasRenderPass(pass);
}
