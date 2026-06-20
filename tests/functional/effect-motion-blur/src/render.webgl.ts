import type { DisplayObject, WebGLRenderEffectPipeline, WebGLRenderTarget } from '@flighthq/sdk';
import {
  beginVelocityFrame,
  beginWebGLRenderEffectPipeline,
  contributeVelocity,
  createMotionBlurEffect,
  createVelocityField,
  createWebGLCanvasElement,
  createWebGLRenderEffectPipeline,
  createWebGLRenderState,
  createWebGLVelocityTarget,
  defaultWebGLDisplayObjectVelocityWriter,
  defaultWebGLMotionBlurEffectRunner,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  endWebGLRenderEffectPipeline,
  getNodeChildAt,
  getNodeChildCount,
  prepareDisplayObjectRender,
  registerDefaultWebGLMaterial,
  registerRenderer,
  registerWebGLRenderEffect,
  registerWebGLShapeCommands,
  registerWebGLVelocityWriter,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  renderWebGLVelocity,
  setWebGLRenderEffectVelocityTexture,
  ShapeKind,
} from '@flighthq/sdk';

// Per-object motion blur driven by the scene velocity G-buffer. Normally the velocity comes from
// per-frame transform deltas, but a static screenshot has only one frame — so here we *explicitly*
// contribute a screen-space velocity to each shape before rendering the velocity pass. That makes the
// blur visible in a single deterministic capture instead of requiring real motion across frames.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x101014ff,
});
registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
registerWebGLShapeCommands(defaultWebGLShapeCommands);
registerDefaultWebGLMaterial(state);
registerWebGLRenderEffect(state, 'motionBlur', defaultWebGLMotionBlurEffectRunner);
// The velocity writer rasterizes each shape's contributed velocity into the velocity target.
registerWebGLVelocityWriter(state, ShapeKind, defaultWebGLDisplayObjectVelocityWriter);

const pipeline: WebGLRenderEffectPipeline = createWebGLRenderEffectPipeline(state, { sampleCount: 4 });

// Velocity target is sized to the canvas backing store (logical size * pixelRatio).
const velocityTarget: WebGLRenderTarget = createWebGLVelocityTarget(state, canvas.width, canvas.height);
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
  renderWebGLVelocity(state, root, velocityField, velocityTarget);
  setWebGLRenderEffectVelocityTexture(pipeline, velocityTarget.texture);

  beginWebGLRenderEffectPipeline(state, pipeline);
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
  endWebGLRenderEffectPipeline(state, pipeline, [createMotionBlurEffect({ intensity: 1, samples: 16 })]);
}
