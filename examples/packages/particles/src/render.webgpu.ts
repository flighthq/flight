import type { Node2D } from '@flighthq/sdk';
import {
  createWgpuCanvasElement,
  createWgpuRenderStateFromCanvasElement,
  enableFlightDiagnostics,
  defaultWgpuParticleEmitter2DRenderer,
  defaultWgpuTextLabelRenderer,
  enableWgpuBlendModeSupport,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  registerStandardWgpuTextureResolvers,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  TextLabelKind,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0a14ff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerStandardWgpuTextureResolvers(state);
registerWgpuStandardMaterial(state);
registerRenderer(state, ParticleEmitter2DKind, defaultWgpuParticleEmitter2DRenderer);
registerRenderer(state, TextLabelKind, defaultWgpuTextLabelRenderer);
enableWgpuBlendModeSupport(state);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuScene2D(state, root);
  submitWgpuRenderPass(state);
}
