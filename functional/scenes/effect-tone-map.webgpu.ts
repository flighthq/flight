import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  createShape,
  createToneMapEffect,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuShapeRenderer,
  registerWgpuToneMapEffect,
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

// Wgpu parity column for the same tone-map intent as render.webgl.ts. Unlike Canvas (passthrough),
// tone mapping is real on Wgpu: bright HDR content rendered into an rgba16f target is compressed
// back to displayable range by the ACES operator. Wgpu render-state init is async; the effect
// pipeline runs between renderWgpuBackground and submitWgpuRenderPass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuToneMapEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4, format: 'rgba16f' });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createToneMapEffect({ operator: 'aces', exposure: 1.5 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

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

export function assertRender(frame: Readonly<Bitmap>): void {
  const whiteCx = Math.round(0.3 * frame.width);
  const whiteCy = Math.round(0.32 * frame.height);
  const whiteRgb = getBitmapPixelRgb(frame, whiteCx, whiteCy);
  const wR = (whiteRgb >> 16) & 0xff;
  const wG = (whiteRgb >> 8) & 0xff;
  const wB = whiteRgb & 0xff;
  const whiteLum = 0.299 * wR + 0.587 * wG + 0.114 * wB;
  if (whiteLum < 150) {
    throw new Error(
      `[effect-tone-map] white block luminance is ${whiteLum.toFixed(1)} (expected ≥150 — tone mapping should preserve brightness)`,
    );
  }
  if (wR >= 250 && wG >= 250 && wB >= 250) {
    throw new Error(
      `[effect-tone-map] white block is still clipped white (${wR},${wG},${wB}) — ACES highlight rolloff did not apply`,
    );
  }

  const redCx = Math.round(0.7 * frame.width);
  const redCy = Math.round(0.32 * frame.height);
  const redRgb = getBitmapPixelRgb(frame, redCx, redCy);
  const rR = (redRgb >> 16) & 0xff;
  const rG = (redRgb >> 8) & 0xff;
  const rB = redRgb & 0xff;
  if (rR < 150) {
    throw new Error(
      `[effect-tone-map] red block R channel is ${rR} (expected ≥150 — red highlight should stay bright after ACES)`,
    );
  }
  if (rG > 50 || rB > 50) {
    throw new Error(
      `[effect-tone-map] red block has G=${rG}, B=${rB} (expected <50 each — ACES should preserve hue, not bleed into other channels)`,
    );
  }
}
