import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  createDisplayObject,
  createShape,
  createToneMapEffect,
  createWgpuAcquisition,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerRenderer,
  registerWgpuToneMapEffect,
  renderWgpuScene2D,
  scene3DWgpuPipeline,
  ShapeKind,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field (about R5 G6 B10), four unrotated 160×160 squares form a 2×2 ' +
    'arrangement: white centred at (240,192), red at (560,192), green at (240,408) and blue at ' +
    '(560,408). The raised highlights roll off instead of clipping: the white square stays bright but ' +
    'below flat R255 G255 B255, approximately 224 per channel because a 1.0 white at 1.5 exposure ' +
    'maps to about 0.877. The red, green and blue squares keep their dominant hue rather than turning ' +
    'white. No gradient, border or extra shape appears, and all gaps stay near-black.',
);

// Wgpu parity column for the same tone-map intent as render.webgl.ts. Unlike Canvas (passthrough),
// tone mapping is real on Wgpu: bright HDR content rendered into an rgba16f target is compressed
// back to displayable range by the ACES operator. Wgpu render-state init is async; the effect
// pipeline runs between beginWgpuRenderPass and submitWgpuFrame.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x05 / 0xff, 0x06 / 0xff, 0x0a / 0xff, 1], depth: 1.0 } as const;
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuToneMapEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1, format: 'rgba16f' });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline, screenClear);
  renderWgpuScene2D(scenePass, root);
  endWgpuRenderEffectPipeline(scenePass, pipeline, [createToneMapEffect({ operator: 'aces', exposure: 1.5 })]);
  endWgpuRenderPass(pass);
}

registerWgpuFunctionalTarget(state, screen, scale);

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
