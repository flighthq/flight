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
  createShape,
  createSmaaEffect,
  defaultGlShapeRenderer,
  registerGlSmaaEffect,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field (about R5 G6 B10), four 180×180 high-contrast rotated squares ' +
    'form a 2×2 arrangement: white at (224,180), red at (576,180), cyan at (224,420) and yellow at ' +
    '(576,420), turned by 27, 40, 53 and 66 degrees. Their diagonal silhouettes have narrow blended ' +
    'antialiasing transitions rather than hard stair steps, while each centre stays a bright flat ' +
    'colour. The squares remain separate, carry no detached outline or glow, and the field around ' +
    'them stays near-black.',
);

// SMAA antialiases the whole frame. This is a single-pass approximation of SMAA (not the full
// edge/blend-weight/neighborhood three-pass), smoothing the jagged diagonal edges.
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
registerGlSmaaEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba8',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createSmaaEffect({ threshold: 0.1 })]);
}

// SMAA antialiases the whole frame. Rotated, high-contrast rectangles present jagged diagonal edges
// (the worst case for aliasing), so a full-frame edge-detect/blend pass has stair-stepping to smooth.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xff3040ff, 0x30c0ffff, 0xffd040ff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -90, -90, 180, 180);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.28 + 0.44 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.4 * Math.floor(i / 2));
  shape.rotation = 27 + i * 13;
  addNodeChild(root, shape);
}

render(root);

// SMAA smooths aliased edges through a multi-pass morphological filter. Shape 0 (white, 0xffffffff)
// at its center should retain high luminance (> 200) after the SMAA pass, verifying the pipeline
// processes content correctly. Without the pipeline or with a broken pass, luminance drops below 200.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cx = Math.round(frame.width * 0.28);
  const cy = Math.round(frame.height * 0.3);
  const rgb = getBitmapPixelRgb(frame, cx, cy);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (lum <= 200) {
    throw new Error(
      `[effect-smaa] white shape center has luminance ${lum.toFixed(1)} (expected > 200) — ` +
        `SMAA pipeline should preserve content; rgb(${r},${g},${b})`,
    );
  }
}
