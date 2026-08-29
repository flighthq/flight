import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createBrightnessContrastAdjustment,
  createDisplayObject,
  getBitmapPixelRgb,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 field completely covered by a 3-by-2 grid of six flat colour blocks, each W/3 x H/2 = 266.7 x 300 ' +
    'px with no background visible anywhere — block centres at x = 133.3, 400 and 666.7 and y = 150 and 450: red, ' +
    'green and blue across the top row, then amber, magenta and cyan across the bottom. Every block is BRIGHTER ' +
    'BUT LESS SATURATED than its plain fill colour — the whole grid is lifted and washed toward a pale mid-tone, ' +
    'so the six blocks sit closer to one another in tone than their raw fills do, and the blue block in the top ' +
    'right reads as a clearly light, muted blue rather than a deep one. A grid whose colours match their raw ' +
    'fills, the blue block reading dark, is the failure; so is a grid whose colours are MORE vivid than their ' +
    'fills. The blocks tile edge to edge with hard straight boundaries, each one flat with no gradient inside it ' +
    'and no blending where two meet.',
);
// Wgpu parity column for the same full-frame brightnessContrast grade as render.webgl.ts: lifts brightness and adds contrast across the whole frame.
// Wgpu render-state init is async (createWgpuRenderState returns a Promise). The effect pipeline
// runs between renderWgpuBackground (opens the encoder + canvas pass) and submitWgpuRenderPass
// (flushes it), grading the rgba8 scene target.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, { pixelRatio, backgroundColor: 0x202830ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createBrightnessContrastAdjustment({ brightness: 0.15, contrast: 0.35 }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Distinct saturated-color shapes filling the frame, suited to showing a full-frame color grade:
// lifts brightness and adds contrast across the whole frame.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff3030ff, 0x30c040ff, 0x3060ffff, 0xffd030ff, 0xff30c0ff, 0x30d0d0ff];
const cols = 3;
const rows = 2;
const cellWidth = logicalWidth / cols;
const cellHeight = logicalHeight / rows;
for (let i = 0; i < colors.length; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, 0, 0, cellWidth, cellHeight);
  appendShapeEndFill(shape);
  shape.x = col * cellWidth;
  shape.y = row * cellHeight;
  addNodeChild(root, shape);
}

render(root);

// Positive brightness (0.15) lifts all luminances. Cell 2 (blue, 0x3060ffff) has the lowest input
// perceived luminance at ~100. After the brightness lift, its output luminance exceeds 115 in both
// sRGB and linear pipelines. Without the effect, cell 2 stays at ~100 and fails the check.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cols = 3;
  const rows = 2;
  const cx = Math.round(((2 + 0.5) * frame.width) / cols);
  const cy = Math.round(((0 + 0.5) * frame.height) / rows);
  const rgb = getBitmapPixelRgb(frame, cx, cy);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (lum <= 115) {
    throw new Error(
      `[effect-brightness-contrast] blue cell luminance is ${lum.toFixed(1)} (expected > 115) — ` +
        `brightness lift not applied; rgb(${r},${g},${b})`,
    );
  }
}
