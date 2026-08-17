import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createChromaticAberrationEffect,
  createDisplayObject,
  getBitmapPixelRgb,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  registerWgpuChromaticAberrationEffect,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for the same chromatic-aberration intent as render.webgl.ts. Unlike Canvas
// (passthrough), chromatic aberration is a real effect on Wgpu: the R/G/B channels are sampled
// with a growing radial offset. Wgpu render-state init is async; the effect pipeline runs between
// renderWgpuBackground and submitWgpuRenderPass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuChromaticAberrationEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createChromaticAberrationEffect({ intensity: 4, radial: true })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// High-contrast white shapes on a dark field, pushed toward the corners where radial aberration is
// strongest. The crisp edges make the per-channel color fringing easy to see.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const positions = [
  [0.16, 0.2],
  [0.84, 0.2],
  [0.16, 0.8],
  [0.84, 0.8],
  [0.5, 0.5],
];
for (let i = 0; i < positions.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, 0xffffffff, 1);
  appendShapeRectangle(shape, -50, -50, 100, 100);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * positions[i][0];
  shape.y = logicalHeight * positions[i][1];
  shape.rotation = i * 15;
  addNodeChild(root, shape);
}

render(root);

// Radial chromatic aberration (intensity 4) separates RGB channels outward from center. Edge pixels
// of shapes show channel fringing — the R, G, and B channels sample from slightly different positions.
// A background pixel adjacent to a shape edge should show color fringing (channel imbalance > 15)
// from the offset channel samples. Without the effect, edge-adjacent background pixels are uniform
// near-black and the maximum channel difference is ~1.
export function assertRender(frame: Readonly<Bitmap>): void {
  let maxImbalance = 0;
  const cx = Math.round(frame.width * 0.5);
  for (let y = 2; y < frame.height - 2; y += 3) {
    const rgb = getBitmapPixelRgb(frame, cx, y);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    const avg = (r + g + b) / 3;
    if (avg > 5 && avg < 200) {
      const imbalance = Math.max(r, g, b) - Math.min(r, g, b);
      if (imbalance > maxImbalance) maxImbalance = imbalance;
    }
  }

  if (maxImbalance < 15) {
    throw new Error(
      `[effect-chromatic-aberration] max channel imbalance at mid-luminance pixels is ${maxImbalance} ` +
        `(expected >= 15) — chromatic fringing not visible`,
    );
  }
}
