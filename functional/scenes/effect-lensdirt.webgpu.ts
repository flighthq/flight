import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  createLensDirtEffect,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  registerWgpuLensDirtEffect,
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

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'Four near-white blocks (white 0xffffff, warm-white 0xfff0c0, cool-white 0xc0f0ff, white 0xffffff) of 160×160 in a 2×2 grid on dark background (0x101014), not rotated. Procedural smudge-like glows appear where scene luminance exceeds the dirt threshold (0.45) — light bleeds outward from the bright blocks into surrounding dark areas with intensity 1.5 and seed 4.',
);

// Wgpu parity column for the same lens-dirt intent as render.webgl.ts. Wgpu render-state init is
// async; the full-frame effect pipeline runs between renderWgpuBackground and submitWgpuRenderPass.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuLensDirtEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createLensDirtEffect({ intensity: 1.5, threshold: 0.45, seed: 4 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Bright shapes on a dark field — lens dirt catches the light: the procedural smudge blobs only brighten
// where the scene luminance exceeds the threshold, so the dirt glows over the bright squares.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// Bright, near-white blocks so the dirt threshold (scene luminance) is exceeded and the smudges light up.
const colors = [0xffffffff, 0xfff0c0ff, 0xc0f0ffff, 0xffffffff];
for (let i = 0; i < colors.length; i++) {
  const block = createShape();
  appendShapeBeginFill(block, colors[i], 1);
  appendShapeRectangle(block, -80, -80, 160, 160);
  appendShapeEndFill(block);
  block.x = logicalWidth * (0.3 + 0.4 * (i % 2));
  block.y = logicalHeight * (0.32 + 0.38 * Math.floor(i / 2));
  addNodeChild(root, block);
}

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const blockCx = Math.round(0.3 * frame.width);
  const blockCy = Math.round(0.32 * frame.height);
  const blockRgb = getBitmapPixelRgb(frame, blockCx, blockCy);
  const blockR = (blockRgb >> 16) & 0xff;
  const blockG = (blockRgb >> 8) & 0xff;
  const blockLum = 0.299 * blockR + 0.587 * blockG + 0.114 * (blockRgb & 0xff);
  if (blockLum < 150) {
    throw new Error(
      `[effect-lensdirt] block 0 luminance is ${blockLum.toFixed(1)} (expected ≥150 — bright block must stay bright)`,
    );
  }

  // Probe a background-only band 6–20 pixels outside every block. Six pixels clears shape-edge AA;
  // 20 stays inside the fixed Gaussian branch's 24-pixel support. The old pointwise shader leaves this
  // entire band at the raw 0x101014 background, while the real bright-pass → blur → dirt recipe carries
  // light into it. Scanning the band also remains valid when GL and WebGPU orient the procedural mask
  // differently; the effect must produce smudged bleed somewhere, not at one backend-specific UV.
  const blockCenters = [
    [0.3, 0.32],
    [0.7, 0.32],
    [0.3, 0.7],
    [0.7, 0.7],
  ];
  const blockHalfWidth = frame.width * 0.1;
  const blockHalfHeight = frame.height * (80 / 600);
  let brightenedBackgroundSamples = 0;
  for (let y = 0; y < frame.height; y += 4) {
    for (let x = 0; x < frame.width; x += 4) {
      let distance = Number.POSITIVE_INFINITY;
      for (const [centerX, centerY] of blockCenters) {
        const dx = Math.max(Math.abs(x - centerX * frame.width) - blockHalfWidth, 0);
        const dy = Math.max(Math.abs(y - centerY * frame.height) - blockHalfHeight, 0);
        distance = Math.min(distance, Math.hypot(dx, dy));
      }
      if (distance < 6 || distance > 20) continue;
      const rgb = getBitmapPixelRgb(frame, x, y);
      const r = (rgb >> 16) & 0xff;
      const g = (rgb >> 8) & 0xff;
      const b = rgb & 0xff;
      if (r > 20 || g > 20 || b > 24) brightenedBackgroundSamples++;
    }
  }

  if (brightenedBackgroundSamples < 8) {
    throw new Error(
      `[effect-lensdirt] only ${brightenedBackgroundSamples} background samples contain light bleed (expected ≥8)`,
    );
  }
}
