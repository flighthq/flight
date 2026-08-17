import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  createOutlineEffect,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  registerWgpuOutlineEffect,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
  getBitmapPixelRgb,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for the same outline intent as render.webgl.ts. Wgpu render-state init is
// async; the full-frame effect pipeline runs between renderWgpuBackground and submitWgpuRenderPass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuOutlineEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createOutlineEffect({ threshold: 0.2, thickness: 2, color: 0x000000ff }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Many small, rotated, overlapping shapes pack the frame with fine detail and diagonal edges, giving
// the outline effect dense high-frequency content (edges, quantizable color, sample neighborhoods)
// to act on.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff5c7cff, 0x5cff9cff, 0x5c9cffff, 0xffd25cff, 0xd25cffff, 0x5cf0ffff];
for (let i = 0; i < 18; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i % colors.length], 1);
  appendShapeRectangle(shape, -28, -10, 56, 20);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.12 + 0.18 * (i % 5));
  shape.y = logicalHeight * (0.18 + 0.2 * Math.floor(i / 5));
  shape.rotation = i * 22;
  addNodeChild(root, shape);
}

render(root);

// The outline pass draws pure black (0x000000ff) edges over a 0x101014ff background, so black is a color
// only the outline can produce — every other pixel in the scene is either the backdrop or a saturated
// fill. Counting pixels below 8 on every channel therefore counts outline directly. Measured with the
// effect applied vs the same scene with the pipeline bypassed: 2.82% of the frame vs exactly 0%. The
// fingerprint cannot see it: its committed grid scores 4.64 against a uniform frame of its own
// background, under the gate's threshold of 5.
export function assertRender(frame: Readonly<Bitmap>): void {
  const ink = measureOutlineInk(frame);
  if (ink < 0.01) {
    throw new Error(
      `[effect-outline] pure-black ink covers ${(ink * 100).toFixed(3)}% of the frame (expected >= 1%) — the ` +
        `shapes carry no outline`,
    );
  }
}

function measureOutlineInk(frame: Readonly<Bitmap>): number {
  let ink = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      if (((rgb >> 16) & 255) < 8 && ((rgb >> 8) & 255) < 8 && (rgb & 255) < 8) ink += 1;
    }
  }
  return ink / (frame.width * frame.height);
}
