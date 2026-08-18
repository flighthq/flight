import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplayObject,
  createExposureAdjustment,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
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

// exposure scales linear light by 2^exposure through an HDR (rgba16f) pipeline, brightening the
// whole frame uniformly before display.
declareExpectedImageDescription(
  'An 800x600 field on a near-black background with four square tiles 140 px on a side, turned 12, 32, 52 and ' +
    '72 degrees, so they span 166, 193, 197 and 176 px corner to corner (side*(cos a + sin a)): white centred ' +
    'near (224,180), warm yellow near (576,180), cyan near (224,420) and pink near (576,420). The whole picture ' +
    'is BRIGHTENED — every tile reads lighter than its raw fill and the three coloured tiles are visibly washed ' +
    'toward white, while the background stays dark. A picture whose tiles match their raw fills is the failure. ' +
    'The tiles keep their positions, their angles and their distinct hues from each other; they do not bloom or ' +
    'spill past their edges.',
);
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
  endGlRenderEffectPipeline(state, pipeline, [createExposureAdjustment({ exposure: 1 })]);
}

// A normal scene of bright, saturated shapes on a near-black field, rendered through an HDR pipeline.
// exposure scales linear light by 2^exposure before display, brightening the whole frame.

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

// Exposure 1 applies a 2x brightness multiplier. The dark background (0x05060aff, luminance ~5)
// should double to ~10+. Without the effect, the background stays at ~5 and fails the > 8 check.
export function assertRender(frame: Readonly<Bitmap>): void {
  const rgb = getBitmapPixelRgb(frame, 4, 4);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (lum <= 8) {
    throw new Error(
      `[effect-exposure] corner pixel luminance is ${lum.toFixed(1)} (expected > 8) — ` +
        `exposure multiplier not applied; rgb(${r},${g},${b})`,
    );
  }
}
