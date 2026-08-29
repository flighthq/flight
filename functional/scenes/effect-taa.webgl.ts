import { hasGlRenderEffectRunner } from '@flighthq/effects-gl/contract';
import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
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
  createTaaEffect,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
  createGlContextFromCanvasElement,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field (about R5 G6 B10), four 140×140 rotated squares form a 2×2 ' +
    'arrangement: white at (224,180), yellow at (576,180), cyan at (224,420) and magenta at ' +
    '(576,420), turned by 12, 32, 52 and 72 degrees. With no history or motion information, the ' +
    'picture is a clean unchanged frame: no temporal ghost, trailing duplicate or accumulated blur ' +
    'follows any edge. All four centres remain bright, the shapes remain separate, and the ' +
    'surrounding field is not cleared to blank.',
);

// GL has no realized TAA capability. The unregistered operation is intentionally skipped so this
// column records the backend's unsupported result without a fake identity implementation.
export const functionalBackendSupport = 'control' as const;

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextFromCanvasElement(canvas, {
    contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  }),
  {
    pixelRatio,
    backgroundColor: 0x05060aff,
  },
);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);

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
  endGlRenderEffectPipeline(state, pipeline, [createTaaEffect({ feedback: 0.9 })]);
}

// A normal scene of bright, saturated shapes on a near-black field. taa is a temporal effect needing a
// history buffer + motion vectors; with neither present here it is a passthrough, but the scene gives
// the pipeline real content to carry through.

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

// TAA applies temporal anti-aliasing with feedback 0.9. Shape 0 (white, 0xffffffff) at its center
// should retain high luminance (> 200) after the TAA pass, verifying the pipeline processes content
// correctly. Without the pipeline, the frame is blank.
export function assertRender(frame: Readonly<Bitmap>): void {
  if (hasGlRenderEffectRunner(state, 'TaaEffect')) {
    throw new Error(
      '[effect-taa] Gl now has a registered TAA runner — update this control cell and its description, ' +
        'which both say that capability is absent',
    );
  }

  const cx = Math.round(frame.width * 0.28);
  const cy = Math.round(frame.height * 0.3);
  const rgb = getBitmapPixelRgb(frame, cx, cy);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (lum <= 200) {
    throw new Error(
      `[effect-taa] white shape center has luminance ${lum.toFixed(1)} (expected > 200) — ` +
        `TAA pipeline should preserve content; rgb(${r},${g},${b})`,
    );
  }
}
