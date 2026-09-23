import { webHostCanvas } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  beginCanvasRenderPass,
  createCanvasElement,
  createCanvasRenderState,
  createCanvasScreenRenderTarget,
  canvasParticleEmitter2DRenderer,
  canvasTextLabelRenderer,
  enableCanvasBlendMode,
  enableFlightDiagnostics,
  endCanvasRenderPass,
  getCanvasRenderStateTextureResolvers,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  registerCanvasImageTextureResolver,
  registerNodeRenderer,
  renderCanvasScene2D,
  canvasScene2DRenderPreset,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const surface = createCanvasElement(webHostCanvas, 800, 500, pixelRatio);
export const canvas = surface.context.canvas as HTMLCanvasElement;
document.body.appendChild(canvas);

export const screen = createCanvasScreenRenderTarget(surface);
export const state = createCanvasRenderState({
  ...canvasScene2DRenderPreset,
  canvasHost: webHostCanvas,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
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
