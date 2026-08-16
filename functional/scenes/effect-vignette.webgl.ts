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
  createVignetteEffect,
  defaultGlShapeRenderer,
  registerGlVignetteEffect,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

// Vignette: a full-bleed bright fill darkened toward the corners. The center stays bright while the
// edges fall off, so the radial darkening is obvious against the flat fill.
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
registerGlVignetteEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createVignetteEffect({ intensity: 1, radius: 0.7, softness: 0.5 })]);
}

// A single full-bleed bright fill covering the whole frame. With a flat, even color the vignette's
// corner darkening is the only variation in the image.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const fill = createShape();
appendShapeBeginFill(fill, 0xe8ecf4ff, 1);
appendShapeRectangle(fill, 0, 0, logicalWidth, logicalHeight);
appendShapeEndFill(fill);
addNodeChild(root, fill);

render(root);

// ORACLE-BLOCK
// Vignette darkens edges while preserving the center. The uniform fill (0xe8ecf4ff, luminance ~234)
// fills the entire frame. The center pixel should remain bright while corner pixels should be
// darkened by the vignette. Without the effect, center and corner luminances are equal, so the
// gap is 0 and fails the > 20 check.
export function assertRender(frame: Readonly<Bitmap>): void {
  function luminanceAt(x: number, y: number): number {
    const rgb = getBitmapPixelRgb(frame, x, y);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const centerLum = luminanceAt(Math.round(frame.width / 2), Math.round(frame.height / 2));
  const cornerLum = luminanceAt(4, 4);

  if (centerLum <= cornerLum + 20) {
    throw new Error(
      `[effect-vignette] center luminance ${centerLum.toFixed(1)} is not > corner luminance ` +
        `${cornerLum.toFixed(1)} + 20 — vignette not applied`,
    );
  }
}
