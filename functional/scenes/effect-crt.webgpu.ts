import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createCrtEffect,
  createDisplayObject,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  registerWgpuCrtEffect,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for the same crt intent as render.webgl.ts. Wgpu render-state init is
// async; the full-frame effect pipeline runs between renderWgpuBackground and submitWgpuRenderPass.
declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 field on a very dark background carrying EIGHTEEN small bars of about 56 x 20, each turned by a ' +
    'different angle, laid out in five columns at x = W*(0.12 + 0.18*c) = 96, 240, 384, 528 and 672 across four ' +
    'rows at y = H*(0.18 + 0.2*r) = 108, 228, 348 and 468 — the first three rows hold five bars each and the last ' +
    'holds only three, so the bottom row is visibly short. The whole picture is treated to look like an old tube ' +
    'display, and three things must all be visible at once: fine horizontal SCANLINES banding the image, a BARREL ' +
    'CURVATURE that bows the picture outward so the bars near the edges are displaced from where they were drawn, ' +
    'and DARKENED CORNERS relative to the centre. Any of the three missing is a failure — flat even brightness, ' +
    'straight unbowed geometry, or a clean unbanded image each mean part of the treatment did not run. The bars ' +
    'keep their individual colours.',
);
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuCrtEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createCrtEffect({ curvature: 0.3, scanlineIntensity: 0.5, vignette: 0.4, aberration: 0.4 }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Many small, rotated, overlapping shapes pack the frame with fine detail and diagonal edges, giving
// the crt effect dense high-frequency content (edges, quantizable color, sample neighborhoods)
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

// CRT combines scanlines (intensity 0.5), barrel curvature (0.3), vignette (0.4), and chromatic
// aberration (0.4). The scanlines alone produce periodic brightness variation across rows, raising
// vertical high-frequency energy above 2. Without the effect, vertical HF stays near the base
// scene level and fails the check.
export function assertRender(frame: Readonly<Bitmap>): void {
  const hf = measureVerticalHighFrequency(frame);
  if (hf < 2) {
    throw new Error(
      `[effect-crt] vertical high-frequency energy is ${hf.toFixed(2)} (expected >= 2) — ` +
        `CRT scanlines not visible`,
    );
  }
}

function measureVerticalHighFrequency(frame: Readonly<Bitmap>): number {
  let deltas = 0;
  let pairs = 0;
  for (let x = 0; x < frame.width; x += 2) {
    let previous = -1;
    for (let y = 0; y < frame.height; y += 1) {
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
