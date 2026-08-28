import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplacementEffect,
  createDisplayObject,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  registerWgpuDisplacementEffect,
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

// Wgpu parity column: hashed block tears + RGB channel separation in a single fullscreen WGSL pass.
declareAntialiasingPolicy('no-aa');

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
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuDisplacementEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createDisplacementEffect({ intensity: 10, frequency: 14, seed: 2 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

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
  const bgRgb = getBitmapPixelRgb(frame, 0, 0);

  const barCx = Math.round(0.5 * frame.width);
  const barCy = Math.round(0.145 * frame.height);
  const centerRgb = getBitmapPixelRgb(frame, barCx, barCy);
  if (centerRgb === bgRgb) {
    throw new Error('[effect-displacement] bar 0 center matches background — scene content missing');
  }

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
