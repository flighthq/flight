import { createWebWgpuCanvasElement } from '@flighthq/host-web';
import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  createDisplayObject,
  createPixelateEffect,
  createShape,
  createWgpuAcquisition,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  defaultWgpuShapeRenderer,
  enableWgpuRenderEffectGuards,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerRenderer,
  registerWgpuPixelateEffect,
  renderWgpuScene2D,
  scene3DWgpuPipeline,
  ShapeKind,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'An 800×600 near-black blue-grey field (about R16 G16 B20) carries 18 red-pink, green, blue, ' +
    'yellow, violet and cyan narrow rectangles in four staggered rows. Each source rectangle is ' +
    '56×20, centred in columns at 12%, 30%, 48%, 66% and 84% of the field width and rows at 18%, 38%, ' +
    '58% and 78% of its height, with only three rectangles in the last row; successive rectangles ' +
    'turn by 22 degrees. The whole picture is reduced to chunky uniform 24 px blocks, so diagonal ' +
    'edges are visibly stair-stepped and fine one-pixel colour changes are absent. The rectangles ' +
    'remain separate, with blocky near-black gaps rather than a continuous coloured mass.',
);

// Wgpu parity column for the same pixelate intent as render.webgl.ts. Wgpu render-state init is
// async; the effect pipeline runs between beginWgpuRenderPass and submitWgpuFrame.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x10 / 0xff, 0x10 / 0xff, 0x14 / 0xff, 1], depth: 1.0 } as const;
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuPixelateEffect(state);
enableWgpuRenderEffectGuards(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline, screenClear);
  renderWgpuScene2D(scenePass, root);
  endWgpuRenderEffectPipeline(scenePass, pipeline, [createPixelateEffect({ size: 24 })]);
  endWgpuRenderPass(pass);
}

registerWgpuFunctionalTarget(state, screen, scale);

// Many small, rotated, overlapping shapes pack the frame with fine detail and diagonal edges, so the
// pixelate block quantization is strongly visible against the high-frequency content.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff5c7cff, 0x5cff9cff, 0x5c9cffff, 0xffd25cff, 0xd25cffff, 0x5cf0ffff];
for (let i = 0; i < 18; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i % colors.length], 1);
  appendShapeRectangle(shape, -28, -10, 56, 20);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.12 + 0.18 * (i % 5));
  shape.y = logicalHeight * (0.18 + 0.2 * Math.floor(i / 5));
  shape.rotation = i * 22;
  addNodeChild(root, shape);
}

render(root);

// Pixelation (size 24) replaces fine detail with large uniform blocks. Adjacent pixels within a
// block are identical, which dramatically reduces high-frequency energy. The unprocessed scene with
// 18 rotated shapes has HF energy > 3; after pixelation it drops below 1.5. Without the effect,
// the fine detail keeps HF above 3 and the assertion fails.
export function assertRender(frame: Readonly<Bitmap>): void {
  const hf = measureHighFrequency(frame);
  if (hf >= 1.5) {
    throw new Error(
      `[effect-pixelate] high-frequency energy is ${hf.toFixed(2)} (expected < 1.5) — ` +
        `pixelation should flatten detail into uniform blocks`,
    );
  }
}

function measureHighFrequency(frame: Readonly<Bitmap>): number {
  let deltas = 0;
  let pairs = 0;
  for (let y = 0; y < frame.height; y += 1) {
    let previous = -1;
    for (let x = 0; x < frame.width; x += 1) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      const value = (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
      if (previous >= 0) {
        deltas += Math.abs(value - previous);
        pairs += 1;
      }
      previous = value;
    }
  }
  return pairs === 0 ? 0 : deltas / pairs;
}
