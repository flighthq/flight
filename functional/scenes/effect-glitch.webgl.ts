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
  getBitmapPixelRgb,
  createGlitchEffect,
  createShape,
  registerGlGlitchEffect,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'Five horizontal color bars (pink 0xff3366, green 0x33ff99, blue 0x3399ff, yellow 0xffcc33, purple 0xcc33ff) on a dark background (0x101014), each spanning 62% of the frame width and 12% of its height, vertically spaced. The bars are torn into displaced horizontal block segments with RGB channel fringing — rows shift sideways and individual color channels separate, producing colored ghost edges alongside the displaced blocks.',
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
registerGlGlitchEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [
    createGlitchEffect({ intensity: 0.7, blockSize: 22, colorShift: 12, seed: 3 }),
  ]);
}

// Bright horizontal colour bars — the structure glitch tears: each block of rows is displaced and the
// RGB channels separated, so the bars break into offset, colour-fringed segments. A clean, high-contrast
// scene makes the tear and channel-shift unmistakable.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff3366ff, 0x33ff99ff, 0x3399ffff, 0xffcc33ff, 0xcc33ffff];
for (let i = 0; i < colors.length; i++) {
  const bar = createShape();
  appendShapeBeginFill(bar, colors[i], 1);
  appendShapeRectangle(bar, 0, 0, logicalWidth * 0.62, logicalHeight * 0.12);
  appendShapeEndFill(bar);
  bar.x = logicalWidth * 0.19;
  bar.y = logicalHeight * (0.1 + i * 0.16);
  addNodeChild(root, bar);
}

render(root);

// Glitch (intensity 0.7, seed 3) displaces horizontal blocks and shifts RGB channels. The 5 clean
// color bars get torn — at least one bar's center row should show a color that differs from its
// original fill by > 30 in at least one channel. Without the effect, all bar centers match their
// original fills exactly.
export function assertRender(frame: Readonly<Bitmap>): void {
  const originals = [0xff3366ff, 0x33ff99ff, 0x3399ffff, 0xffcc33ff, 0xcc33ffff];
  let displaced = 0;

  for (let i = 0; i < originals.length; i++) {
    const cx = Math.round(frame.width * 0.5);
    const cy = Math.round(frame.height * (0.1 + i * 0.16 + 0.06));
    const rgb = getBitmapPixelRgb(frame, cx, cy);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    const origR = (originals[i] >> 16) & 0xff;
    const origG = (originals[i] >> 8) & 0xff;
    const origB = originals[i] & 0xff;
    const maxDiff = Math.max(Math.abs(r - origR), Math.abs(g - origG), Math.abs(b - origB));
    if (maxDiff > 30) displaced++;
  }

  if (displaced === 0) {
    throw new Error(`[effect-glitch] all 5 bar centers match original fills — glitch displacement not visible`);
  }
}
