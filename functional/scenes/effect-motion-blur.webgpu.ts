import type { DisplayObject } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginVelocityFrame,
  beginWgpuRenderEffectPipeline,
  contributeVelocity,
  createDisplayContainer,
  createMotionBlurEffect,
  createShape,
  createVelocityField,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuVelocityTarget,
  defaultWgpuDisplayObjectVelocityWriter,
  defaultWgpuMotionBlurEffectRunner,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  getNodeChildAt,
  getNodeChildCount,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerRenderer,
  registerWgpuRenderEffect,
  registerWgpuShapeCommands,
  registerWgpuVelocityWriter,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  renderWgpuVelocity,
  setWgpuRenderEffectVelocityTexture,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for per-object motion blur, the mirror of render.webgl.ts. A static screenshot has
// no transform delta to derive motion from, so each shape is given an explicit screen-space velocity
// before the velocity pass (renderWgpuVelocity) rasterizes it into the velocity G-buffer; the motion
// blur runner then smears each shape along its own vector. Exercises the Wgpu velocity producer end to
// end (createWgpuVelocityTarget → registerWgpuVelocityWriter → renderWgpuVelocity).
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuShapeCommands(defaultWgpuShapeCommands);
registerDefaultWgpuMaterial(state);
registerWgpuRenderEffect(state, 'MotionBlurEffect', defaultWgpuMotionBlurEffectRunner);
// The velocity writer rasterizes each shape's contributed velocity into the velocity target.
registerWgpuVelocityWriter(state, ShapeKind, defaultWgpuDisplayObjectVelocityWriter);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });

// Velocity target is sized to the canvas backing store (logical size * pixelRatio).
const velocityTarget = createWgpuVelocityTarget(state, canvas.width, canvas.height);
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

  renderWgpuBackground(state);
  renderWgpuVelocity(state, root, velocityField, velocityTarget);
  setWgpuRenderEffectVelocityTexture(pipeline, velocityTarget.texture);

  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuDisplayObject(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createMotionBlurEffect({ intensity: 1, samples: 16 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// A few solid shapes spread across the frame. Velocity is contributed in render.webgl.ts (one static
// frame has no transform delta to derive motion from), so the scene here is just the geometry to smear.

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff5c7cff, 0x5cff9cff, 0x5c9cffff, 0xffd25cff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -50, -50, 100, 100);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.25 + 0.5 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.4 * Math.floor(i / 2));
  addNodeChild(root, shape);
}

render(root);
