import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  createHalftoneEffect,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  registerWgpuHalftoneEffect,
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
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'Eighteen small rotated rectangles (56×20 each, six cycling colors: pink 0xff5c7c, green 0x5cff9c, blue 0x5c9cff, gold 0xffd25c, purple 0xd25cff, cyan 0x5cf0ff) on a dark 800×600 background (0x101014) in a 5×4 grid (x centers at ~96/240/384/528/672, y centers at ~108/228/348/468; last row has 3), each rotated by i×22°. A halftone dot screen (scale 4, angle 22.92 degrees) replaces the flat fills with round dots — darker areas produce larger dots, brighter areas smaller ones. Smooth flat fills with no visible dot pattern is a failure.',
);

// Wgpu parity column for the same halftone intent as render.webgl.ts. Wgpu render-state init is
// async; the full-frame effect pipeline runs between renderWgpuBackground and submitWgpuRenderPass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuHalftoneEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createHalftoneEffect({ scale: 4, angle: 22.92 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Many small, rotated, overlapping shapes pack the frame with fine detail and diagonal edges, giving
// the halftone effect dense high-frequency content (edges, quantizable color, sample neighborhoods)
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

// Halftone replaces flat fills with a dot screen, and a dot screen is high-frequency structure — exactly
// what the regression fingerprint averages away into the flat tone underneath. Adjacent-pixel energy
// proves that the effect exists somewhere, while the darkest spatial tile proves that the grid still
// covers the whole frame. The second arm catches a signed-remainder regression that left ample healthy
// texture elsewhere but turned the negative rotated-coordinate region solid black. That regression's
// minimum tile coverage was 0%; healthy WebGL/WebGPU captures measure 66.73%/66.67%, leaving the 10% floor
// well clear of representation noise.
export function assertRender(frame: Readonly<Bitmap>): void {
  const highFrequency = measureHighFrequency(frame);
  if (highFrequency < 3) {
    throw new Error(
      `[effect-halftone] adjacent-pixel energy is ${highFrequency.toFixed(2)} (expected >= 3) — the fills are ` +
        `smooth, so no dot screen was applied`,
    );
  }

  const darkestTileCoverage = measureDarkestTileCoverage(frame);
  if (darkestTileCoverage < 0.1) {
    throw new Error(
      `[effect-halftone] darkest spatial tile retains ${(darkestTileCoverage * 100).toFixed(2)}% non-black ` +
        `pixels (expected >= 10%) — a large black dead zone replaced part of the dot grid`,
    );
  }
}

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

function measureDarkestTileCoverage(frame: Readonly<Bitmap>): number {
  const columns = Math.min(8, frame.width);
  const rows = Math.min(6, frame.height);
  if (columns === 0 || rows === 0) return 0;

  let minimumCoverage = 1;
  for (let row = 0; row < rows; row += 1) {
    const startY = Math.floor((row * frame.height) / rows);
    const endY = Math.floor(((row + 1) * frame.height) / rows);
    for (let column = 0; column < columns; column += 1) {
      const startX = Math.floor((column * frame.width) / columns);
      const endX = Math.floor(((column + 1) * frame.width) / columns);
      let nonBlackPixels = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          if (getBitmapPixelRgb(frame, x, y) !== 0) nonBlackPixels += 1;
        }
      }
      const pixelCount = (endX - startX) * (endY - startY);
      minimumCoverage = Math.min(minimumCoverage, nonBlackPixels / pixelCount);
    }
  }
  return minimumCoverage;
}
