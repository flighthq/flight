import type { DisplayObject } from '@flighthq/sdk';
import {
  beginWebGPURenderEffectPipeline,
  createCameraMotionBlurEffect,
  createWebGPUCanvasElement,
  createWebGPURenderEffectPipeline,
  createWebGPURenderState,
  defaultWebGPUCameraMotionBlurEffectRunner,
  defaultWebGPUShapeCommands,
  defaultWebGPUShapeRenderer,
  endWebGPURenderEffectPipeline,
  prepareDisplayObjectRender,
  registerDefaultWebGPUMaterial,
  registerRenderer,
  registerWebGPURenderEffect,
  registerWebGPUShapeCommands,
  renderWebGPUBackground,
  renderWebGPUDisplayObject,
  ShapeKind,
  submitWebGPURenderPass,
} from '@flighthq/sdk';

import { registerWebGPUFunctionalTarget } from '../../_harness/verify';

// WebGPU parity column. WebGPU has no velocity G-buffer here, so the effect is color-only/uniform:
// it applies a uniform full-frame blur rather than a motion-vector-driven smear.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWebGPUShapeRenderer);
registerWebGPUShapeCommands(defaultWebGPUShapeCommands);
registerDefaultWebGPUMaterial(state);
registerWebGPURenderEffect(state, 'cameraMotionBlur', defaultWebGPUCameraMotionBlurEffectRunner);

const pipeline = createWebGPURenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  beginWebGPURenderEffectPipeline(state, pipeline);
  renderWebGPUDisplayObject(state, root);
  endWebGPURenderEffectPipeline(state, pipeline, [createCameraMotionBlurEffect({ intensity: 0.8, samples: 12 })]);
  submitWebGPURenderPass(state);
}

registerWebGPUFunctionalTarget(state, scale);
