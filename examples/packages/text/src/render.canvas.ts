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
  canvasLineStyle,
  canvasRichTextRenderer,
  canvasShapeRenderer,
  canvasTextLabelRenderer,
  enableFlightDiagnostics,
  endCanvasRenderPass,
  prepareScene2DRender,
  registerCanvasShapeCommands,
  registerCanvasHost,
  registerNodeRenderer,
  renderCanvasScene2D,
  RichTextKind,
  canvasScene2DRenderPreset,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const surface = createCanvasElement(webHostCanvas, 800, 600, pixelRatio);
export const canvas = surface.context.canvas as HTMLCanvasElement;
document.body.appendChild(canvas);

export const screen = createCanvasScreenRenderTarget(surface);
export const state = createCanvasRenderState(canvasScene2DRenderPreset, createCanvasTextureResolvers(webHostCanvas), {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  pixelRatio,
});
registerCanvasHost(state, webHostCanvas);
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [1, 1, 1, 1] } as const;
enableFlightDiagnostics(state);

registerNodeRenderer(state, RichTextKind, canvasRichTextRenderer);
registerNodeRenderer(state, ShapeKind, canvasShapeRenderer);
registerNodeRenderer(state, TextLabelKind, canvasTextLabelRenderer);
registerCanvasShapeCommands(state, [canvasBeginFill, canvasDrawRectangle, canvasEndFill, canvasLineStyle]);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginCanvasRenderPass(state, screen, screenClear);
  renderCanvasScene2D(pass, root);
  endCanvasRenderPass(pass);
}
