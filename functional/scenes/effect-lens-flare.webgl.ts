import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplayObject,
  getBitmapPixelRgb,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createLensFlareEffect,
  createShape,
  registerGlLensFlareEffect,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

// Lens flare [HDR]: bright shapes above the threshold seed ghosts and a halo mirrored through the
// frame center, run through an HDR (rgba16f) pipeline so bright spots carry the flare.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x05060aff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlLensFlareEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [
    createLensFlareEffect({ threshold: 0.7, intensity: 1.6, ghosts: 5, halo: 0.4 }),
  ]);
}

// Bright, saturated shapes on a near-black field — high luminance to seed lens-flare ghosts and halo.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xfff05cff, 0x5cffe0ff, 0xff5ce0ff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -70, -70, 140, 140);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.28 + 0.44 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.4 * Math.floor(i / 2));
  shape.rotation = 12 + i * 20;
  addNodeChild(root, shape);
}

render(root);

// ORACLE-BLOCK
// Lens flare (intensity 1.6, 5 ghosts, halo 0.4) creates ghost images and halo rings from bright
// regions. The ghosts are symmetric about the frame center, so areas away from shapes receive
// flare light, elevating their luminance above the pure background (~5). A mid-frame pixel in a
// dark region should show luminance > 8. Without the effect, it stays at ~5 and fails.
export function assertRender(frame: Readonly<Bitmap>): void {
  const x = Math.round(frame.width * 0.1);
  const y = Math.round(frame.height * 0.5);
  const rgb = getBitmapPixelRgb(frame, x, y);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (lum <= 8) {
    throw new Error(
      `[effect-lens-flare] dark-region pixel has luminance ${lum.toFixed(1)} ` +
        `(expected > 8) — lens flare ghosts/halo not visible; rgb(${r},${g},${b})`,
    );
  }
}
