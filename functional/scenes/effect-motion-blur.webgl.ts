import type { DisplayObject, GlRenderEffectPipeline, GlRenderTarget } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  beginVelocityFrame,
  contributeVelocity,
  createDisplayContainer,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createGlVelocityTarget,
  createMotionBlurEffect,
  createShape,
  createVelocityField,
  defaultGlDisplayObjectVelocityWriter,
  defaultGlMotionBlurEffectRunner,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  getNodeChildAt,
  getNodeChildCount,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerGlRenderEffect,
  registerGlShapeCommands,
  registerGlVelocityWriter,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
  renderGlVelocity,
  setGlRenderEffectVelocityTexture,
} from '@flighthq/sdk';

// Per-object motion blur driven by the scene velocity G-buffer. Normally the velocity comes from
// per-frame transform deltas, but a static screenshot has only one frame — so here we *explicitly*
// contribute a screen-space velocity to each shape before rendering the velocity pass. That makes the
// blur visible in a single deterministic capture instead of requiring real motion across frames.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x101014ff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlShapeCommands(defaultGlShapeCommands);
registerDefaultGlMaterial(state);
registerGlRenderEffect(state, 'MotionBlurEffect', defaultGlMotionBlurEffectRunner);
// The velocity writer rasterizes each shape's contributed velocity into the velocity target.
registerGlVelocityWriter(state, ShapeKind, defaultGlDisplayObjectVelocityWriter);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

// Velocity target is sized to the canvas backing store (logical size * pixelRatio).
const velocityTarget: GlRenderTarget = createGlVelocityTarget(state, canvas.width, canvas.height);
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
  renderGlVelocity(state, root, velocityField, velocityTarget);
  setGlRenderEffectVelocityTexture(pipeline, velocityTarget.texture);

  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createMotionBlurEffect({ intensity: 1, samples: 16 })]);
}

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
