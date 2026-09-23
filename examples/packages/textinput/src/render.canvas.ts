import { webHostCanvas } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  beginCanvasRenderPass,
  createCanvasElement,
  createCanvasRenderState,
  createCanvasSurfaceFromNativeHandle,
  createCanvasScreenRenderTarget,
  createCanvasTextureResolvers,
  canvasBeginFill,
  canvasDrawRectangle,
  canvasEndFill,
  canvasLineStyle,
  canvasLineTo,
  canvasMoveTo,
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
import { enableCanvasTextInput } from '@flighthq/sdk/scene2d-canvas';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(webHostCanvas, 800, 600, pixelRatio);
document.body.style.margin = '0';
document.body.appendChild(canvas);

export const screen = createCanvasScreenRenderTarget(createCanvasSurfaceFromNativeHandle(webHostCanvas, canvas));
export const state = createCanvasRenderState(canvasScene2DRenderPreset, createCanvasTextureResolvers(webHostCanvas), {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  pixelRatio,
});
registerCanvasHost(state, webHostCanvas);
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0xd0 / 0xff, 0xd0 / 0xff, 0xd0 / 0xff, 1] } as const;
enableFlightDiagnostics(state);

registerNodeRenderer(state, RichTextKind, canvasRichTextRenderer);
registerNodeRenderer(state, ShapeKind, canvasShapeRenderer);
registerNodeRenderer(state, TextLabelKind, canvasTextLabelRenderer);
registerCanvasShapeCommands(state, [
  canvasBeginFill,
  canvasDrawRectangle,
  canvasEndFill,
  canvasLineStyle,
  canvasLineTo,
  canvasMoveTo,
]);
enableCanvasTextInput();

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginCanvasRenderPass(state, screen, screenClear);
  renderCanvasScene2D(pass, root);
  endCanvasRenderPass(pass);
}
