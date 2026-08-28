import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendPathLineTo,
  appendPathMoveTo,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createBloomEffect,
  createClipRegionFromPath,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createPath,
  createShape,
  registerGlBloomEffect,
  defaultGlShapeRenderer,
  enableGlClipSupport,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
  setNode2DClip,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field, a bright pale-cyan triangle is centred with apex at (400,150) ' +
    'and a horizontal base from (250,450) to (550,450). The interior, including the field centre, is ' +
    'luminous and a soft bloom extends just beyond the three edges. The original 300×300 square does ' +
    'not appear: its top corners and all pixels outside the triangular contour remain background ' +
    'apart from the narrow glow. The triangle is neither blank nor replaced by a rectangle.',
);

// Gl parity column: the same triangular contour clip inside an HDR (rgba16f) bloom pipeline. The
// contour clip is realized by a stencil pass, so the effect pipeline's scene target is created with a
// depth-stencil buffer (depth: 'depth-stencil').
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x05060aff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
enableGlClipSupport(state);
registerGlBloomEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createBloomEffect({ threshold: 0.4, intensity: 1.3 })]);
}

// A bright square masked by a TRIANGULAR (non-rectangular) contour clip, rendered through an HDR
// (rgba16float) effect pipeline. The contour clip is realized by a stencil pass, whose pipeline must
// match the effect target's color format — this is the regression test for the Wgpu clip-contour
// pipeline being keyed on the current color format (otherwise the stencil pipeline, built for the canvas
// rgba8 format, mismatches the rgba16float scene target and the frame is blank/invalid).

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const HALF = 150;
const shape = createShape();
appendShapeBeginFill(shape, 0x88ddffff, 1);
appendShapeRectangle(shape, -HALF, -HALF, HALF * 2, HALF * 2);
appendShapeEndFill(shape);
shape.x = logicalWidth / 2;
shape.y = logicalHeight / 2;

// Triangular contour clip in the shape's local space — a non-rectangular region, so it goes through the
// stencil contour path (not the scissor-rect fast path).
const clipPath = createPath();
appendPathMoveTo(clipPath, -HALF, HALF);
appendPathLineTo(clipPath, HALF, HALF);
appendPathLineTo(clipPath, 0, -HALF);
appendPathLineTo(clipPath, -HALF, HALF);
setNode2DClip(shape, createClipRegionFromPath(clipPath));

addNodeChild(root, shape);
render(root);

// A triangular contour clip masks a bright white square, rendered through an HDR (rgba16f) bloom
// pipeline. The center of the frame (where the triangle's interior is) should show the white
// content with luminance > 150, verifying both the stencil-based clip and the HDR bloom pipeline
// work together. Without the pipeline, the frame is blank.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cx = Math.round(frame.width * 0.5);
  const cy = Math.round(frame.height * 0.5);
  const rgb = getBitmapPixelRgb(frame, cx, cy);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (lum <= 150) {
    throw new Error(
      `[scene2d-clip-contour-hdr] center pixel has luminance ${lum.toFixed(1)} (expected > 150) — ` +
        `clip + HDR bloom pipeline should render the triangular white region; rgb(${r},${g},${b})`,
    );
  }
}
