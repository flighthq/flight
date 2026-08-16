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
  createLensDirtEffect,
  createShape,
  registerGlLensDirtEffect,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

// Hashed horizontal block tears + per-channel RGB separation in one fullscreen pass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x101014ff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlLensDirtEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createLensDirtEffect({ intensity: 1.5, threshold: 0.45, seed: 4 })]);
}

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
  // Lens dirt adds procedural smudge blobs that only brighten where scene luminance exceeds the
  // threshold (0.45). The scene has bright near-white blocks on a dark 0x101014 field.
  //
  // Semantic checks:
  // 1. Block centers remain bright (the dirt adds light, never subtracts).
  // 2. The bright blocks' luminance exceeds the threshold, so the dirt effect must be active —
  //    verify that at least one background-region pixel between blocks is brighter than the raw
  //    background (0x101014), proving the procedural smudge glow bled into the dark field.

  // Block 0 center: x = 0.3 × width, y = 0.32 × height.
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

  // Background raw luminance: 0x101014 → R=16, G=16, B=20 → lum ≈ 16.6.
  // Sample dark regions between blocks and at corners. If the dirt effect applied, at least some
  // should be above the raw background due to procedural glow bleed.
  const darkSamples = [
    [0.5, 0.5],
    [0.1, 0.1],
    [0.9, 0.1],
    [0.1, 0.9],
    [0.9, 0.9],
    [0.5, 0.15],
    [0.5, 0.85],
    [0.15, 0.5],
    [0.85, 0.5],
  ];
  let aboveRawBg = 0;
  for (const [fx, fy] of darkSamples) {
    const rgb = getBitmapPixelRgb(frame, Math.round(fx * frame.width), Math.round(fy * frame.height));
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    if (r > 20 || g > 20 || b > 24) aboveRawBg++;
  }

  if (aboveRawBg === 0) {
    throw new Error('[effect-lensdirt] no background pixel is above raw background level — lens dirt glow is absent');
  }
}
