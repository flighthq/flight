import type { DisplayObject } from '@flighthq/sdk';
import {
  beginVelocityFrame,
  beginWebGPURenderEffectPipeline,
  contributeVelocity,
  createMotionBlurEffect,
  createVelocityField,
  createWebGPUCanvasElement,
  createWebGPURenderEffectPipeline,
  createWebGPURenderState,
  createWebGPUVelocityTarget,
  defaultWebGPUDisplayObjectVelocityWriter,
  defaultWebGPUMotionBlurEffectRunner,
  defaultWebGPUShapeCommands,
  defaultWebGPUShapeRenderer,
  endWebGPURenderEffectPipeline,
  getNodeChildAt,
  getNodeChildCount,
  prepareDisplayObjectRender,
  registerDefaultWebGPUMaterial,
  registerRenderer,
  registerWebGPURenderEffect,
  registerWebGPUShapeCommands,
  registerWebGPUVelocityWriter,
  renderWebGPUBackground,
  renderWebGPUDisplayObject,
  renderWebGPUVelocity,
  setWebGPURenderEffectVelocityTexture,
  ShapeKind,
  submitWebGPURenderPass,
} from '@flighthq/sdk';

import { registerWebGPUFunctionalTarget } from '../../_harness/verify';

// WebGPU parity column for per-object motion blur, the mirror of render.webgl.ts. A static screenshot has
// no transform delta to derive motion from, so each shape is given an explicit screen-space velocity
// before the velocity pass (renderWebGPUVelocity) rasterizes it into the velocity G-buffer; the motion
// blur runner then smears each shape along its own vector. Exercises the WebGPU velocity producer end to
// end (createWebGPUVelocityTarget → registerWebGPUVelocityWriter → renderWebGPUVelocity).
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWebGPUShapeRenderer);
registerWebGPUShapeCommands(defaultWebGPUShapeCommands);
registerDefaultWebGPUMaterial(state);
registerWebGPURenderEffect(state, 'motionBlur', defaultWebGPUMotionBlurEffectRunner);
// The velocity writer rasterizes each shape's contributed velocity into the velocity target.
registerWebGPUVelocityWriter(state, ShapeKind, defaultWebGPUDisplayObjectVelocityWriter);

const pipeline = createWebGPURenderEffectPipeline(state, { sampleCount: 1 });

// Velocity target is sized to the canvas backing store (logical size * pixelRatio).
const velocityTarget = createWebGPUVelocityTarget(state, canvas.width, canvas.height);
const velocityField = createVelocityField();

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;

  // One frame of contributions: give every top-level child a fixed horizontal screen-space velocity so
  // the motion-blur pass has direction/length to smear, even with no prior frame.
  beginVelocityFrame(velocityField);
  const childCount = getNodeChildCount(root);
  for (let i = 0; i < childCount; i++) {
    const child = getNodeChildAt(root, i);
    if (child !== null) contributeVelocity(velocityField, child, 40 * pixelRatio, 0);
  }

  renderWebGPUBackground(state);
  renderWebGPUVelocity(state, root, velocityField, velocityTarget);
  setWebGPURenderEffectVelocityTexture(pipeline, velocityTarget.texture);

  beginWebGPURenderEffectPipeline(state, pipeline);
  renderWebGPUDisplayObject(state, root);
  endWebGPURenderEffectPipeline(state, pipeline, [createMotionBlurEffect({ intensity: 1, samples: 16 })]);
  submitWebGPURenderPass(state);
}

registerWebGPUFunctionalTarget(state, scale);
