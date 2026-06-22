import type { DisplayObject } from '@flighthq/sdk';
import {
  beginWgpuRenderEffectPipeline,
  createDirectionalBlurEffect,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuDirectionalBlurEffectRunner,
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

import { registerWgpuFunctionalTarget } from '../../_harness/verify';

// Wgpu parity column. The directional smear is a color-only/uniform full-frame blur along the
// configured angle (no depth/velocity G-buffer is involved).
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuShapeCommands(defaultWgpuShapeCommands);
registerDefaultWgpuMaterial(state);
registerWgpuRenderEffect(state, 'directionalBlur', defaultWgpuDirectionalBlurEffectRunner);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuDisplayObject(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createDirectionalBlurEffect({ angle: 0.5, length: 24, samples: 12 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);
