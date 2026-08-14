import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createColorGradeAdjustment,
  createDisplayObject,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
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
import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for the same color-grade intent as render.webgl.ts. Wgpu render-state init
// is async; the effect pipeline runs between renderWgpuBackground and submitWgpuRenderPass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createColorGradeAdjustment({ saturation: 1.5, contrast: 1.2, temperature: 0.2 }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// A spread of distinct, saturated colors so the grade's saturation/contrast/temperature shifts are
// visible across hues rather than on a single tone.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff3b30ff, 0x34c759ff, 0x007affff, 0xffcc00ff, 0xaf52deff, 0xff9500ff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -60, -80, 120, 160);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.18 + 0.32 * (i % 3));
  shape.y = logicalHeight * (0.32 + 0.4 * Math.floor(i / 3));
  addNodeChild(root, shape);
}

render(root);

// ORACLE-BLOCK
// Color grade with saturation 1.5 increases the channel spread. Cell 1 (green, 0x34c759,
// R=52, G=199, B=89) has original spread 147. After 1.5x saturation, the spread should exceed 160.
// Without the effect, spread is 147 < 160 and the assertion fails.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cx = Math.round(frame.width * 0.5);
  const cy = Math.round(frame.height * 0.32);
  const rgb = getBitmapPixelRgb(frame, cx, cy);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);

  if (spread <= 160) {
    throw new Error(
      `[effect-color-grade] green cell spread is ${spread} (expected > 160) — ` +
        `saturation boost not applied; rgb(${r},${g},${b})`,
    );
  }
}
