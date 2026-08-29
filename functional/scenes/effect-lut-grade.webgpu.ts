import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  bakeColorLut,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  getBitmapPixelRgb,
  createLookupTableGradeAdjustment,
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
  'Six rectangles in a 3×2 grid filling the 800×600 frame (cells ~267×300 px; columns at x 0/267/533, rows at y 0/300; source colors red 0xff3030, green 0x30c040, blue 0x3060ff, yellow 0xffd030, magenta 0xff30c0, cyan 0x30d0d0) with a warm color grade from a 32³ lookup table. The R channel is lifted (γ=0.8), the G channel slightly compressed (γ=1.1), and the B channel crushed (γ=1.5). The red cell (R=255) stays at full red but loses its blue/green component (B drops from 48 to ~21), becoming a purer red. The blue cell (B=255) is nearly unchanged because its dominant channel at 1.0 maps to 1.0 under any gamma. No gaps between cells. Six panels matching their ungraded source colors is a failure.',
);

// Wgpu parity column for the same full-frame lutGrade grade as render.webgl.ts: applies a baked 32^3
// warm-tone LUT at full strength. The grade lifts reds (γ=0.8), slightly compresses greens (γ=1.1),
// and crushes blues (γ=1.5). Wgpu render-state init is async (createWgpuRenderState returns a Promise).
// The effect pipeline runs between renderWgpuBackground (opens the encoder + canvas pass) and
// submitWgpuRenderPass (flushes it), grading the rgba8 scene target.
const warmGradeLut = bakeColorLut(
  [
    (out, r, g, b) => {
      out[0] = r ** 0.8;
      out[1] = g ** 1.1;
      out[2] = b ** 1.5;
    },
  ],
  32,
);
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
  endWgpuRenderEffectPipeline(state, pipeline, [createLookupTableGradeAdjustment({ lut: warmGradeLut, strength: 1 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Distinct saturated-color shapes filling the frame, suited to showing a full-frame color grade:
// applies a 32^3 lookup-table grade at full strength.

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

// The warm-tone LUT crushes blues (γ=1.5): cell 0 (red, 0xff3030ff, R=255, G=48, B=48) has B=48
// input → B≈21 graded (pow(48/255, 1.5)·255 ≈ 21). Without the LUT, B stays at 48. Checking the
// graded VALUE (B ≤ 35), not just distance from input, so a coincidental perturbation cannot satisfy it.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cols = 3;
  const rows = 2;
  const cx = Math.round(((0 + 0.5) * frame.width) / cols);
  const cy = Math.round(((0 + 0.5) * frame.height) / rows);
  const rgb = getBitmapPixelRgb(frame, cx, cy);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;

  if (b > 35) {
    throw new Error(
      `[effect-lut-grade] red cell blue channel is ${b} (expected ≤35 after γ=1.5 blue crush; ` +
        `ungraded would be 48) — LUT grading not applied; rgb(${r},${g},${b})`,
    );
  }
}
