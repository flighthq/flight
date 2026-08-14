import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

// Empty passthrough: the scene renders through the opt-in effect pipeline with an EMPTY effect list
// and sampleCount 1 (single-sampled, no MSAA). begin -> render -> end with no stages must present the
// scene unchanged, proving the pipeline's present path is an identity blit.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x101014ff,
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// Simple shapes on a neutral field. With an empty effect pipeline, the presented frame must match a
// plain direct render exactly — so these flat, axis-aligned shapes make any unintended tint, blur, or
// offset from the passthrough path easy to spot.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff5c5cff, 0x5cff5cff, 0x5c5cffff, 0xffff5cff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -70, -70, 140, 140);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.28 + 0.44 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.4 * Math.floor(i / 2));
  addNodeChild(root, shape);
}

render(root);

// ORACLE-BLOCK
// Empty effect list is a passthrough — the frame should match the unprocessed scene. Cell 0
// (0xff5c5c, R≈255, G≈92, B≈92) should be preserved. The oracle catches pipeline bugs that corrupt
// content during the round-trip through the effect pipeline.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cx = Math.round(frame.width * 0.25);
  const cy = Math.round(frame.height * 0.25);
  const rgb = getBitmapPixelRgb(frame, cx, cy);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;

  if (r < 200 || g > 130 || b > 130) {
    throw new Error(
      `[effect-empty-passthrough] cell 0 has rgb(${r},${g},${b}) — expected red-dominant (R>200, G<130, B<130) for passthrough`,
    );
  }
}
