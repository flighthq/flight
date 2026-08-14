import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  getBitmapPixelRgb,
  createLensDirtEffect,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  registerWgpuLensDirtEffect,
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

// Wgpu parity column: hashed block tears + RGB channel separation in a single fullscreen WGSL pass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
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

// ORACLE-BLOCK
// Lens dirt (intensity 1.5, threshold 0.45) overlays a procedural scattering pattern on bright
// regions, simulating light spreading through a dirty lens. Background pixels near bright shapes
// should show elevated luminance from the dirt scattering. A pixel at the frame edge center should
// have luminance > 8 (above pure background ~5). Without the effect, it stays at ~5 and fails.
export function assertRender(frame: Readonly<Bitmap>): void {
  const rgb = getBitmapPixelRgb(frame, 8, Math.round(frame.height / 2));
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (lum <= 8) {
    throw new Error(
      `[effect-lensdirt] edge pixel luminance is ${lum.toFixed(1)} (expected > 8) — ` +
        `lens dirt scattering not visible; rgb(${r},${g},${b})`,
    );
  }
}
