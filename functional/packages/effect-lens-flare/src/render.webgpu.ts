import type { DisplayObject } from '@flighthq/sdk';
import {
  beginWgpuRenderEffectPipeline,
  createLensFlareEffect,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuLensFlareEffectRunner,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerRenderer,
  registerWgpuRenderEffect,
  registerWgpuShapeCommands,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  ShapeKind,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for the same lens-flare intent as render.webgl.ts, also using the HDR
// (rgba16f) scene target so bright spots seed ghosts and the halo.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuShapeCommands(defaultWgpuShapeCommands);
registerDefaultWgpuMaterial(state);
registerWgpuRenderEffect(state, 'LensFlareEffect', defaultWgpuLensFlareEffectRunner);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4, format: 'rgba16f' });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuDisplayObject(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createLensFlareEffect({ threshold: 0.7, intensity: 1.6, ghosts: 5, halo: 0.4 }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);
