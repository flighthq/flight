import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createBokehDepthOfFieldEffect,
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
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'An 800x600 field on a near-black background showing four turned tiles of about 160 px, placed near ' +
    'the four corners rather than in a tidy grid: white near (128,108), warm yellow near (672,120), cyan ' +
    'near (144,492) and pink near (656,480) — with the picture DEFOCUSED. The blur is UNIFORM across the whole frame — every tile is softened by the ' +
    'same amount and no part of the picture stays sharp while another blurs. Tile edges read as soft ' +
    'gradients rather than lines, and fine detail is gone. The whole ' +
    'frame carries much less high-frequency contrast than the same scene drawn without the effect: a ' +
    'picture where every tile edge is crisp is the failure. Colours and positions are unchanged by the ' +
    'blur — the tiles stay in place and keep their hues, they are simply soft.',
);
// WGPU has no realized bokeh depth-of-field capability. The unregistered operation is intentionally
// skipped so this column records the backend's unsupported result without a misleading whole-frame blur.
export const functionalBackendSupport = 'control' as const;

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
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
    createBokehDepthOfFieldEffect({ focusDistance: 0.5, focusRange: 0.15, maxBlur: 6 }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Off-center shapes retain the shared scene intent while the missing backend capability stays visible
// as an unchanged image.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xfff05cff, 0x5cffe0ff, 0xff5ce0ff];
const positions = [
  [0.16, 0.18],
  [0.84, 0.2],
  [0.18, 0.82],
  [0.82, 0.8],
];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -80, -80, 160, 160);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * positions[i][0];
  shape.y = logicalHeight * positions[i][1];
  shape.rotation = 8 + i * 14;
  addNodeChild(root, shape);
}

render(root);

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

// Bokeh depth-of-field (maxBlur 6, focusRange 0.15) blurs out-of-focus regions. The tight focus
// range means most of the frame is blurred, significantly reducing HF energy from the original
// ~3-4 to below 2. Without the effect, sharp edges keep HF above 2 and the check fails.
export function assertRender(frame: Readonly<Bitmap>): void {
  const hf = measureHighFrequency(frame);
  if (hf >= 2) {
    throw new Error(
      `[effect-bokeh-dof] high-frequency energy is ${hf.toFixed(2)} (expected < 2) — ` +
        `depth-of-field blur should smooth edges`,
    );
  }
}
