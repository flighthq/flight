import type { DisplayObject } from '@flighthq/sdk';
import {
  beginWgpuRenderEffectPipeline,
  createCameraMotionBlurEffect,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuCameraMotionBlurEffectRunner,
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

// Wgpu parity column. Wgpu has no velocity G-buffer here, so the effect is color-only/uniform:
// it applies a uniform full-frame blur rather than a motion-vector-driven smear.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuShapeCommands(defaultWgpuShapeCommands);
registerDefaultWgpuMaterial(state);
registerWgpuRenderEffect(state, 'CameraMotionBlurEffect', defaultWgpuCameraMotionBlurEffectRunner);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuDisplayObject(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createCameraMotionBlurEffect({ intensity: 0.8, samples: 12 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);
