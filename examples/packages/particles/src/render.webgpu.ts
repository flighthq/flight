import type { DisplayObject } from '@flighthq/sdk';
import {
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuParticleEmitter2DRenderer,
  defaultWgpuTextLabelRenderer,
  enableWgpuBlendModeSupport,
  ParticleEmitter2DKind,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  TextLabelKind,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0a14ff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerDefaultWgpuMaterial(state);
registerRenderer(state, ParticleEmitter2DKind, defaultWgpuParticleEmitter2DRenderer);
registerRenderer(state, TextLabelKind, defaultWgpuTextLabelRenderer);
enableWgpuBlendModeSupport(state);

export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuDisplayObject(state, root);
  submitWgpuRenderPass(state);
}
