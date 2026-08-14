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
  createToneMapEffect,
  defaultGlShapeRenderer,
  registerGlToneMapEffect,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

// Tone map: bright HDR content (rendered into an rgba16f target) is compressed back to displayable
// range by the ACES operator with raised exposure. Highlights roll off instead of clipping to flat white.
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
registerGlToneMapEffect(state);

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
  endGlRenderEffectPipeline(state, pipeline, [createToneMapEffect({ operator: 'aces', exposure: 1.5 })]);
}

// Bright, fully-saturated primaries on a dark field. With raised exposure these drive the HDR target
// well above 1.0, giving the ACES operator strong highlights to roll off.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xff0000ff, 0x00ff00ff, 0x0000ffff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -80, -80, 160, 160);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.3 + 0.4 * (i % 2));
  shape.y = logicalHeight * (0.32 + 0.36 * Math.floor(i / 2));
  addNodeChild(root, shape);
}

render(root);

// ORACLE-BLOCK
// ACES tone mapping with exposure 1.5 compresses highlights and boosts shadows. The dark background
// (0x05060a, luminance ~5) gets lifted by the exposure multiplier and the ACES curve's shadow lift.
// A corner background pixel should have luminance > 15. Without the effect, it stays at ~5 and fails.
export function assertRender(frame: Readonly<Bitmap>): void {
  const rgb = getBitmapPixelRgb(frame, 4, 4);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (lum <= 15) {
    throw new Error(
      `[effect-tone-map] corner pixel luminance is ${lum.toFixed(1)} (expected > 15) — ` +
        `ACES tone mapping not applied; rgb(${r},${g},${b})`,
    );
  }
}
