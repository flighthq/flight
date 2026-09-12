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
  createExposureAdjustment,
  createShape,
  createWgpuAcquisitionFromCanvasElement,
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
  renderWgpuScene2D,
  scene3DWgpuPipeline,
  ShapeKind,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for exposure. The HDR rgba16f scene target is multiplied by 2^exposure; init
// is async so createWgpuRenderState is awaited.
declareAntialiasingPolicy('no-aa');

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
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisitionFromCanvasElement(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x05 / 0xff, 0x06 / 0xff, 0x0a / 0xff, 1], depth: 1.0 } as const;
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1, format: 'rgba16f' });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline, screenClear);
  renderWgpuScene2D(scenePass, root);
  endWgpuRenderEffectPipeline(scenePass, pipeline, [createExposureAdjustment({ exposure: 1 })]);
  endWgpuRenderPass(pass);
}

registerWgpuFunctionalTarget(state, screen, scale);

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
