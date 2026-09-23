import { webHostCanvas } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  beginCanvasRenderPass,
  BitmapTextKind,
  createCanvasElement,
  createCanvasRenderState,
  createCanvasScreenRenderTarget,
  createCanvasTextureResolvers,
  canvasBitmapTextRenderer,
  canvasSpriteRenderer,
  enableFlightDiagnostics,
  endCanvasRenderPass,
  getCanvasRenderStateTextureResolvers,
  prepareScene2DRender,
  registerCanvasImageTextureResolver,
  registerCanvasHost,
  registerNodeRenderer,
  renderCanvasScene2D,
  canvasScene2DRenderPreset,
  SpriteKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const surface = createCanvasElement(webHostCanvas, 800, 600, pixelRatio);
export const canvas = surface.context.canvas as HTMLCanvasElement;
document.body.appendChild(canvas);

export const screen = createCanvasScreenRenderTarget(surface);
export const state = createCanvasRenderState(canvasScene2DRenderPreset, createCanvasTextureResolvers(webHostCanvas), {
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerCanvasHost(state, webHostCanvas);
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x11 / 0xff, 0x18 / 0xff, 0x27 / 0xff, 1] } as const;
enableFlightDiagnostics(state);

registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
registerNodeRenderer(state, SpriteKind, canvasSpriteRenderer);
registerNodeRenderer(state, BitmapTextKind, canvasBitmapTextRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginCanvasRenderPass(state, screen, screenClear);
  renderCanvasScene2D(pass, root);
  endCanvasRenderPass(pass);
}
