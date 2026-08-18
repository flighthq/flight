import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplacementEffect,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  registerGlDisplacementEffect,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

// Hashed horizontal block tears + per-channel RGB separation in one fullscreen pass.
declareExpectedImageDescription(
  'An 800x600 field on a very dark background with five wide horizontal bars, each about 512 px wide ' +
    'and 78 px tall, stacked down the field from x 144 with their tops near y 48, 150, 252, 354 and ' +
    '456: red, green, blue, amber and purple from top to bottom. Their edges are RIPPLED rather than ' +
    'straight — each bar wobbles along its length in a repeating wave, so no edge is a clean horizontal ' +
    'line, and the wobble pattern repeats several times across a bar rather than bending it once. Five ' +
    'bars with straight edges is the failure. Each bar keeps its own flat colour and its overall place ' +
    'in the stack; the bars do not merge into one another.',
);
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
registerGlDisplacementEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createDisplacementEffect({ intensity: 10, frequency: 14, seed: 2 })]);
}

// Sharp colour bars with crisp horizontal/vertical edges — the structure the displacement warp bends.
// The animated sine field wobbles the sample position, so the straight bar edges become wavy.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff5c5cff, 0x5cff9cff, 0x5c9cffff, 0xffd25cff, 0xcc5cffff];
for (let i = 0; i < colors.length; i++) {
  const bar = createShape();
  appendShapeBeginFill(bar, colors[i], 1);
  appendShapeRectangle(bar, 0, 0, logicalWidth * 0.64, logicalHeight * 0.13);
  appendShapeEndFill(bar);
  bar.x = logicalWidth * 0.18;
  bar.y = logicalHeight * (0.08 + i * 0.17);
  addNodeChild(root, bar);
}

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  // Displacement with intensity=10, frequency=14 warps bar edges via a per-channel sine field.
  // Without displacement, bar 0 has a clean vertical left edge at x ≈ 0.18 × width. The sine
  // warp displaces each channel independently, so edge pixels gain per-channel colour separation
  // that a straight edge never has.
  //
  // Semantic checks:
  // 1. Bar center (well inside the bar) is NOT background — the scene rendered content.
  // 2. The nominal left-edge column of bar 0 has multiple distinct colours across its height,
  //    proving the edge was warped (an undisplaced edge is a single vertical colour boundary).

  const bgRgb = getBitmapPixelRgb(frame, 0, 0);

  // Bar 0 center: x ≈ (0.18 + 0.32) × width = 0.5 × width, y ≈ (0.08 + 0.065) × height.
  const barCx = Math.round(0.5 * frame.width);
  const barCy = Math.round(0.145 * frame.height);
  const centerRgb = getBitmapPixelRgb(frame, barCx, barCy);
  if (centerRgb === bgRgb) {
    throw new Error('[effect-displacement] bar 0 center matches background — scene content missing');
  }

  // Sample the nominal left edge (x = 0.18 × width) at 8 evenly spaced Y positions within bar 0.
  // Bar 0 spans y from 0.08 × height to (0.08 + 0.13) × height.
  const edgeX = Math.round(0.18 * frame.width);
  const barTop = Math.round(0.08 * frame.height);
  const barBot = Math.round(0.21 * frame.height);
  const distinctColors = new Set<number>();
  for (let i = 0; i < 8; i++) {
    const y = barTop + Math.round(((barBot - barTop) * (i + 0.5)) / 8);
    distinctColors.add(getBitmapPixelRgb(frame, edgeX, y));
  }
  if (distinctColors.size < 2) {
    throw new Error(
      `[effect-displacement] bar 0 left edge has ${distinctColors.size} distinct colour(s) across 8 samples — ` +
        'expected ≥2 (displacement should warp the straight edge into a wavy boundary)',
    );
  }
}
