import { webHostCanvas } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  beginCanvasRenderPass,
  createCanvasElement,
  createCanvasRenderState,
  createCanvasSurfaceFromNativeHandle,
  createCanvasScreenRenderTarget,
  createCanvasTextureResolvers,
  canvasParticleEmitter2DRenderer,
  canvasTextLabelRenderer,
  enableCanvasBlendMode,
  enableFlightDiagnostics,
  endCanvasRenderPass,
  getCanvasRenderStateTextureResolvers,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  registerCanvasImageTextureResolver,
  registerCanvasHost,
  registerNodeRenderer,
  renderCanvasScene2D,
  canvasScene2DRenderPreset,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(webHostCanvas, 800, 600, pixelRatio);
document.body.appendChild(canvas);

export const screen = createCanvasScreenRenderTarget(createCanvasSurfaceFromNativeHandle(webHostCanvas, canvas));
export const state = createCanvasRenderState(canvasScene2DRenderPreset, createCanvasTextureResolvers(webHostCanvas), {
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerCanvasHost(state, webHostCanvas);
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x0a / 0xff, 0x0a / 0xff, 0x14 / 0xff, 1] } as const;
enableFlightDiagnostics(state);

registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
registerNodeRenderer(state, ParticleEmitter2DKind, canvasParticleEmitter2DRenderer);
registerNodeRenderer(state, TextLabelKind, canvasTextLabelRenderer);
enableCanvasBlendMode(state);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginCanvasRenderPass(state, screen, screenClear);
  renderCanvasScene2D(pass, root);
  endCanvasRenderPass(pass);
}
