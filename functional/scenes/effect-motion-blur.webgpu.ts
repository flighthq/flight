import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginVelocityFrame,
  beginWgpuRenderEffectPipeline,
  contributeVelocity,
  createDisplayObject,
  createMotionBlurEffect,
  createShape,
  createVelocityField,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuVelocityTarget,
  defaultWgpuNode2DVelocityWriter,
  registerWgpuMotionBlurEffect,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  getBitmapPixelRgb,
  getNodeChildAt,
  getNodeChildCount,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  registerWgpuVelocityWriter,
  renderWgpuBackground,
  renderWgpuScene2D,
  renderWgpuVelocity,
  setWgpuRenderEffectVelocityTexture,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'Four colored squares (pink 0xff5c7c, green 0x5cff9c, blue 0x5c9cff, gold 0xffd25c) of 100×100 in a 2×2 arrangement centered at (200,180)/(600,180)/(200,420)/(600,420) on dark 800×600 background (0x101014), not rotated. Each shape is smeared symmetrically along the horizontal axis by a 40-pixel screen-space velocity (16 taps spanning t=[-0.5, 0.5], so ~20 px each side). Sharp vertical edges become soft horizontal gradients on both sides. Four clean-edged squares with no horizontal smear is a failure.',
);

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
registerWgpuStandardMaterial(state);
registerWgpuMotionBlurEffect(state);
// The velocity writer rasterizes each shape's contributed velocity into the velocity target.
registerWgpuVelocityWriter(state, ShapeKind, defaultWgpuNode2DVelocityWriter);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });

// Velocity target is sized to the canvas backing store (logical size * pixelRatio).
const velocityTarget = createWgpuVelocityTarget(state, canvas.width, canvas.height);
const velocityField = createVelocityField();

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;

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
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createMotionBlurEffect({ intensity: 1, samples: 16 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// A few solid shapes spread across the frame. Velocity is contributed in render.webgl.ts (one static
// frame has no transform delta to derive motion from), so the scene here is just the geometry to smear.

const root = createDisplayObject();
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

function measureHighFrequency(frame: Readonly<Bitmap>): number {
  let deltas = 0;
  let pairs = 0;
  for (let y = 0; y < frame.height; y += 1) {
    let previous = -1;
    for (let x = 0; x < frame.width; x += 1) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      const value = (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
      if (previous >= 0) {
        deltas += Math.abs(value - previous);
        pairs += 1;
      }
      previous = value;
    }
  }
  return pairs === 0 ? 0 : deltas / pairs;
}

// Motion blur (intensity 1, 16 samples) smears the scene along the motion vector. The 4 squares
// have axis-aligned edges, but the blur spreads color across boundaries, reducing HF energy from
// the sharp transitions. Without the effect, clean square edges keep HF above 1.5.
export function assertRender(frame: Readonly<Bitmap>): void {
  const hf = measureHighFrequency(frame);
  if (hf >= 1.5) {
    throw new Error(
      `[effect-motion-blur] high-frequency energy is ${hf.toFixed(2)} (expected < 1.5) — ` +
        `motion blur should smooth transitions`,
    );
  }
}
